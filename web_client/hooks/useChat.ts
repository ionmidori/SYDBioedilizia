import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './useAuth';

export type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    parts?: any[];
    toolInvocations?: ToolInvocation[];
    attachments?: {
        images?: string[];
    };
};

export interface ToolInvocation {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args?: any;
    result?: any;
}

export function useChat(sessionId: string, initialMessages: any[] = []) {
    const { refreshToken, loading: authLoading } = useAuth();
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
        message: { role: string; content: string; attachments?: any },
        options?: {
            body?: {
                images?: string[];
                imageUrls?: string[];
                mediaUrls?: string[];
                mediaTypes?: string[];
                mediaMetadata?: any;
                videoFileUris?: string[];  // 🎬 NEW: File API video URIs
            }
        }
    ) => {
        setIsLoading(true);
        setError(undefined);

        // Add user message immediately (Optimistic UI)
        const userMsgId = uuidv4();
        const userMsg: Message = {
            id: userMsgId,
            role: 'user' as const,
            content: message.content,
            attachments: message.attachments
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
            // ✅ Best Practice: Wait for auth to be ready
            if (authLoading) {
                throw new Error('Authentication not ready. Please wait...');
            }

            // 🔄 CRITICAL FIX: Always get a fresh token before API calls
            // This prevents 401 auth/id-token-expired errors
            const freshToken = await refreshToken();
            if (!freshToken) {
                throw new Error('Failed to get authentication token. Please reload the page.');
            }

            abortControllerRef.current = new AbortController();

            // 🔒 FIREBASE ANONYMOUS AUTH: All users (including anonymous) have ID tokens
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${freshToken}`, // ✅ Fresh token for every request
            };

            // ✅ PYTHON BACKEND (Default): Uses new Python/LangGraph implementation
            // Legacy TypeScript endpoint available at /api/chat if needed for rollback
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    sessionId,
                    images: options?.body?.images,
                    imageUrls: options?.body?.imageUrls,
                    mediaUrls: options?.body?.mediaUrls,
                    mediaTypes: options?.body?.mediaTypes,
                    mediaMetadata: options?.body?.mediaMetadata,
                    videoFileUris: options?.body?.videoFileUris  // 🎬 NEW
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

    }, [messages, sessionId, authLoading, refreshToken]);

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
