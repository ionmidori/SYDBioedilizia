import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    parts?: any[];
    toolInvocations?: ToolInvocation[];
};

export interface ToolInvocation {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args?: any;
    result?: any;
}

export function useChat(sessionId: string, initialMessages: any[] = []) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | undefined>(undefined);
    const abortControllerRef = useRef<AbortController | null>(null);

    // ✅ Load history on mount
    useEffect(() => {
        if (!sessionId || initialMessages.length > 0) return;

        const fetchHistory = async () => {
            try {
                const res = await fetch(`/api/chat/history?sessionId=${sessionId}`);
                if (!res.ok) throw new Error('Failed to load history');

                const data = await res.json();
                if (data.messages && Array.isArray(data.messages)) {
                    setMessages(data.messages);
                }
            } catch (err) {
                console.error('[useChat] Failed to load history:', err);
            }
        };

        fetchHistory();
    }, [sessionId, initialMessages.length]);

    const handleInputChange = (e: any) => {
        setInput(e.target.value);
    };

    const append = useCallback(async (
        message: { role: string; content: string },
        options?: { body?: { images?: string[]; imageUrls?: string[] } }
    ) => {
        setIsLoading(true);
        setError(undefined);

        // Add user message immediately (Optimistic UI)
        const userMsgId = uuidv4();
        const userMsg: Message = {
            id: userMsgId,
            role: 'user',
            content: message.content
        };

        setMessages(prev => [...prev, userMsg]);
        setInput(''); // Clear input if used via handleSubmit logic

        // Create Assistant Placeholder
        const assistantMsgId = uuidv4();
        const assistantContent = '';

        setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: ''
        }]);

        try {
            abortControllerRef.current = new AbortController();

            // 🔒 HYBRID AUTH: Get Firebase ID Token if available (optional for Guest mode)
            const { auth } = await import('@/lib/firebase');
            const user = auth.currentUser;

            let idToken: string | null = null;

            if (user) {
                // User is authenticated - get token
                idToken = await user.getIdToken();
            }
            // If no user, proceed as Guest (idToken remains null)

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            // Only add Authorization header if we have a token
            if (idToken) {
                headers['Authorization'] = `Bearer ${idToken}`;
            }

            // ✅ PYTHON BACKEND (Default): Uses new Python/LangGraph implementation
            // Legacy TypeScript endpoint available at /api/chat if needed for rollback
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    sessionId,
                    images: options?.body?.images,
                    imageUrls: options?.body?.imageUrls  // Public URLs for modification mode
                }),
                signal: abortControllerRef.current.signal
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`API Error: ${res.status} ${errText}`);
            }

            if (!res.body) throw new Error('No response body');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let assistantContent = '';
            const assistantTools: ToolInvocation[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep partial line

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Parse Vercel Data Stream Protocol manually
                    // Format: 0:"text_content"
                    const colonIndex = line.indexOf(':');
                    if (colonIndex === -1) continue;

                    const code = line.substring(0, colonIndex);
                    const rest = line.substring(colonIndex + 1);

                    try {
                        const parsed = JSON.parse(rest);
                        if (code === '0') {
                            // Text chunk
                            assistantContent += parsed;
                            setMessages(prev => prev.map(m =>
                                m.id === assistantMsgId ? { ...m, content: assistantContent, toolInvocations: assistantTools } : m
                            ));
                        } else if (code === '3') {
                            // Error chunk
                            if (parsed.error) throw new Error(parsed.error);
                        } else if (code === '9') {
                            // Tool Call chunk
                            const toolCall = {
                                toolCallId: parsed.toolCallId,
                                toolName: parsed.toolName,
                                args: parsed.args,
                                state: 'call' as const
                            };
                            assistantTools.push(toolCall);
                            setMessages(prev => prev.map(m =>
                                m.id === assistantMsgId ? { ...m, content: assistantContent, toolInvocations: [...assistantTools] } : m
                            ));
                        } else if (code === 'a') {
                            // Tool Result chunk
                            const toolIndex = assistantTools.findIndex(t => t.toolCallId === parsed.toolCallId);
                            if (toolIndex !== -1) {
                                assistantTools[toolIndex] = {
                                    ...assistantTools[toolIndex],
                                    state: 'result',
                                    result: parsed.result
                                };
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId ? { ...m, content: assistantContent, toolInvocations: [...assistantTools] } : m
                                ));
                            }
                        }
                    } catch (e) {
                        // Ignore parsing errors for individual lines
                    }
                }
            }

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Chat Stream Error:", err);
                setError(err);
                // Optional: Remove the failed assistant message or show error state
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }

    }, [messages, sessionId]);

    const handleSubmit = useCallback(async (e?: any, options?: any) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        await append({ role: 'user', content: input }, options);
    }, [input, append]);

    return {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        setInput,
        append,
        setMessages,
        isLoading,
        error
    };
}
