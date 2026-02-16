import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Message } from '@/types/chat';

/**
 * Backend message format from Python API
 */
interface BackendMessage {
    id: string;
    role: string;
    content: string;
    timestamp?: string;
    tool_call_id?: string;
    tool_calls?: any[];
    attachments?: {
        images?: string[];
        videos?: string[];
        documents?: string[];
    };
}

interface UseChatHistoryOptions {
    /**
     * Enable automatic polling (revalidation) for realtime-like updates.
     * Default: 5000ms (5 seconds)
     */
    refreshInterval?: number;
    /**
     * Disable automatic revalidation on focus/reconnect.
     */
    revalidateOnFocus?: boolean;
    /**
     * Number of messages to fetch per page.
     */
    limit?: number;
}

interface UseChatHistoryReturn {
    historyLoaded: boolean;
    historyMessages: Message[];
    isLoading: boolean;
    error: Error | undefined;
    mutate: () => void;
}

/**
 * Custom hook for loading chat history from Python backend via Firestore.
 * 
 * **Realtime Implementation (Protocol G):**
 * - Uses Firestore `onSnapshot` for true realtime updates.
 * - Listens directly to the `sessions/{sessionId}/messages` collection.
 * - Automatically updates the UI when new messages (or tool outputs) arrive.
 * 
 * **Features:**
 * - **Zero Latency:** Immediate feedback for AI responses and tool execution.
 * - **Smart Merging:** Links `tool` outputs to their corresponding `assistant` calls.
 * - **Robustness:** Handles connection drops and re-synchronizes automatically.
 * - **Type-Safe:** Fully typed with `Message` interface.
 */
export function useChatHistory(
    sessionId: string | undefined,
    options: UseChatHistoryOptions = {}
): UseChatHistoryReturn {
    const { user, loading: authLoading } = useAuth();

    const {
        refreshInterval = 5000, // Poll every 5 seconds for new messages
        revalidateOnFocus = true,
        limit = 50
    } = options;

    // Only fetch if we have sessionId and user is authenticated
    const shouldFetch = !authLoading && !!user && !!sessionId;

    // -- REALTIME LISTENER (Protocol G) --
    const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | undefined>(undefined);

    useEffect(() => {
        let unsubscribe: () => void;

        async function setupListener() {
            if (!shouldFetch) {
                // Determine if we should be loading or just waiting
                if (authLoading) setIsLoading(true);
                return;
            }

            setIsLoading(true);
            setError(undefined);

            try {
                // Ensure db is ready (though we import it directly, clean check)
                const { db } = await import('@/lib/firebase');
                const { collection, query, orderBy, limit: firestoreLimit, onSnapshot: firestoreOnSnapshot } = await import('firebase/firestore');

                const q = query(
                    collection(db, 'sessions', sessionId, 'messages'),
                    orderBy('timestamp', 'desc'),
                    firestoreLimit(limit)
                );

                unsubscribe = firestoreOnSnapshot(q, (snapshot) => {
                    // Docs are Newest -> Oldest (DESC)
                    // We map them, then reverse to get Oldest -> Newest for UI
                    const rawMessages = snapshot.docs.map(doc => {
                        const data = doc.data();

                        // Parse tool_calls
                        let toolInvocations = undefined;
                        if (data.tool_calls && Array.isArray(data.tool_calls)) {
                            toolInvocations = data.tool_calls.map((tc: any) => ({
                                toolCallId: tc.id || tc.tool_call_id,
                                toolName: tc.function?.name || tc.name,
                                args: typeof tc.function?.arguments === 'string'
                                    ? JSON.parse(tc.function.arguments)
                                    : (tc.function?.arguments || tc.args),
                                state: 'result', // Stored messages are always results
                                result: 'See tool output' // We link results below
                            }));
                        }

                        // Parse attachments from backend format
                        let attachments = undefined;
                        if (data.attachments) {
                            attachments = data.attachments;
                        }

                        // Clean content
                        let content = data.content || '';
                        if (content && (attachments?.images?.length || attachments?.videos?.length)) {
                            content = content
                                .replace(/\[(Immagine|Video) allegata:.*?\]/g, '')
                                .replace(/\[https?:\/\/.*?\]/g, '')
                                .trim();
                        }

                        return {
                            id: doc.id,
                            role: data.role as 'user' | 'assistant' | 'system' | 'tool',
                            content,
                            createdAt: data.timestamp?.toDate() || new Date(),
                            timestamp: data.timestamp?.toDate()?.toISOString(),
                            toolInvocations,
                            tool_call_id: data.tool_call_id,
                            attachments
                        } as Message;
                    });

                    // Reverse to restore chronological order (Oldest -> Newest)
                    const messages = rawMessages.reverse();

                    // Link Tool Results (Smart Merge)
                    const linkedMessages = messages.map(msg => {
                        if (msg.role === 'assistant' && msg.toolInvocations) {
                            return {
                                ...msg,
                                toolInvocations: msg.toolInvocations.map((tool: any) => {
                                    const toolResultMsg = messages.find(m =>
                                        m.role === 'tool' && m.tool_call_id === tool.toolCallId
                                    );

                                    if (toolResultMsg) {
                                        let parsedResult = toolResultMsg.content;
                                        try {
                                            if (typeof toolResultMsg.content === 'string' &&
                                                (toolResultMsg.content.startsWith('{') || toolResultMsg.content.startsWith('['))) {
                                                parsedResult = JSON.parse(toolResultMsg.content);
                                            }
                                        } catch (e) { /* ignore */ }

                                        return {
                                            ...tool,
                                            state: 'result',
                                            result: parsedResult
                                        };
                                    }
                                    return tool;
                                })
                            };
                        }
                        return msg;
                    });

                    setHistoryMessages(linkedMessages as Message[]);
                    setIsLoading(false);
                }, (err) => {
                    console.error('[useChatHistory] Snapshot Error:', err);
                    setError(err);
                    setIsLoading(false);
                });

            } catch (err: any) {
                console.error('[useChatHistory] Setup Error:', err);
                setError(err);
                setIsLoading(false);
            }
        }

        setupListener();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [sessionId, shouldFetch, limit, authLoading]);

    const historyLoaded = !isLoading && !authLoading;

    return {
        historyLoaded,
        historyMessages,
        isLoading,
        error,
        mutate: () => { } // No-op for realtime
    };
}
