import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import type { Message } from '@/types/chat';

interface UseChatHistoryOptions {
    /**
     * Number of messages to fetch per page.
     */
    limit?: number;
}

interface UseChatHistoryReturn {
    historyLoaded: boolean;
    historyMessages: Message[];
    loadedForSessionId: string | undefined;
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
        limit = 50
    } = options;

    // Only fetch if we have sessionId and user is authenticated
    const shouldFetch = !authLoading && !!user && !!sessionId;

    // -- REALTIME LISTENER (Protocol G) --
    // ADR-001: Documented onSnapshot exception for real-time chat updates.
    // This allows zero-latency UI updates without persistent backend SSE/WS overhead.
    // See: docs/ADR/ADR-001-realtime-onSnapshot-vs-SSE.md
    const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | undefined>(undefined);
    // Tracks WHICH sessionId the current historyMessages were loaded for.
    // Remains at the previous value while the new session is loading,
    // allowing the ChatProvider history sync to detect stale data and skip.
    const [loadedForSessionId, setLoadedForSessionId] = useState<string | undefined>(undefined);

    useEffect(() => {
        let isMounted = true;
        let unsubscribe: () => void;

        async function setupListener() {
            if (!shouldFetch) {
                // Determine if we should be loading or just waiting
                if (authLoading && isMounted) setIsLoading(true);
                else if (isMounted) setIsLoading(false); // 🔥 Fix: Guest mode = loaded (empty)
                return;
            }

            if (isMounted) {
                setIsLoading(true);
                // Clear stale messages immediately so history sync doesn't see old data
                // between the session change and the new Firestore snapshot arriving.
                setHistoryMessages([]);
                setError(undefined);
            }

            try {
                // Ensure db is ready (though we import it directly, clean check)
                const { db } = await import('@/lib/firebase');
                const { collection, query, orderBy, limit: firestoreLimit, onSnapshot: firestoreOnSnapshot } = await import('firebase/firestore');

                // CRITICAL FIX: If component unmounted while waiting for import, abort!
                if (!isMounted) return;

                const q = query(
                    collection(db, 'sessions', sessionId as string, 'messages'),
                    orderBy('timestamp', 'desc'),
                    firestoreLimit(limit)
                );

                unsubscribe = firestoreOnSnapshot(q, { includeMetadataChanges: false }, (snapshot) => {
                    // Docs are Newest -> Oldest (DESC)
                    // We map them, then reverse to get Oldest -> Newest for UI

                    // 🕒 Stable snapshot time for all pending messages in THIS pass.
                    // This prevents micro-timestamp differences from breaking the tie-breaker.
                    const snapshotTime = new Date();

                    const rawMessages = snapshot.docs.map(doc => {
                        const data = doc.data();

                        // Parse tool_calls
                        let toolInvocations = undefined;
                        if (data.tool_calls && Array.isArray(data.tool_calls)) {
                            toolInvocations = (data.tool_calls as { id?: string; tool_call_id?: string; name?: string; function?: { name?: string; arguments?: string | Record<string, unknown> }; args?: Record<string, unknown> }[]).map((tc) => ({
                                toolCallId: tc.id || tc.tool_call_id || '',
                                toolName: tc.function?.name || tc.name || 'unknown',
                                args: typeof tc.function?.arguments === 'string'
                                    ? JSON.parse(tc.function.arguments)
                                    : (tc.function?.arguments || tc.args || {}),
                                state: 'result' as const,
                                result: 'See tool output'
                            }));
                        }

                        // 📎 Attachment Transformation Resilience Layer
                        // Handles:
                        // 1. Legacy: List of objects [{url: string, type: string}]
                        // 2. Structured: { images: string[], videos: string[] } (Preferred)
                        // 3. Fallback: message.parts (AI SDK v6) handled in MessageItem
                        let attachments = undefined;
                        const rawAttachments = data.attachments;
                        
                        if (rawAttachments) {
                            if (Array.isArray(rawAttachments)) {
                                // Convert Legacy Array -> Structured Object
                                attachments = {
                                    images: rawAttachments.filter(a => a.type === 'image').map(a => a.url),
                                    videos: rawAttachments.filter(a => a.type === 'video').map(a => a.url),
                                    documents: rawAttachments.filter(a => a.type === 'document').map(a => a.url)
                                };
                            } else if (typeof rawAttachments === 'object') {
                                // Use as-is, ensuring arrays exist
                                attachments = {
                                    images: Array.isArray(rawAttachments.images) ? rawAttachments.images : [],
                                    videos: Array.isArray(rawAttachments.videos) ? rawAttachments.videos : [],
                                    documents: Array.isArray(rawAttachments.documents) ? rawAttachments.documents : []
                                };
                            }
                        }

                        // Clean content (strip internal attachment markers)
                        let content = (data.content || '') as string;
                        if (content && (attachments?.images?.length || attachments?.videos?.length)) {
                            content = content
                                .replace(/\[(Immagine|Video) allegata:.*?\]/g, '')
                                .replace(/\[https?:\/\/.*?\]/g, '')
                                .trim();
                        }

                        // Parse timestamp
                        const createdAt = data.timestamp?.toDate() || snapshotTime;

                        return {
                            id: doc.id,
                            role: (data.role || 'user').toLowerCase() as 'user' | 'assistant' | 'system' | 'tool',
                            content,
                            createdAt,
                            timestamp: createdAt.toISOString(),
                            toolInvocations,
                            tool_call_id: data.tool_call_id,
                            attachments,
                            rating: data.rating
                        } as Message;
                    });

                    // 3. Consistent Sorting Logic
                    // Sort by timestamp ASCENDING (Oldest first).
                    // Tie-breaker: role priority (user < assistant) for messages within 500ms.
                    // The backend saves user at t-100ms and assistant at t+Nms, so 500ms
                    // covers any realistic same-turn gap while preserving cross-turn order.
                    const rolePriority: Record<string, number> = {
                        system: 0,
                        user: 1,
                        assistant: 2,
                        tool: 3
                    };
                    const messages = rawMessages.sort((a, b) => {
                        const timeA = (a.createdAt as Date).getTime();
                        const timeB = (b.createdAt as Date).getTime();
                        const diff = timeA - timeB;

                        // If messages differ by more than 500ms, use chronological order
                        if (Math.abs(diff) > 500) {
                            return diff;
                        }

                        // Within 500ms: apply role priority (user always before assistant)
                        const priorityA = rolePriority[a.role] ?? 5;
                        const priorityB = rolePriority[b.role] ?? 5;
                        if (priorityA !== priorityB) {
                            return priorityA - priorityB;
                        }

                        // Same role and timestamp: stable sort by document ID
                        return (a.id || '').localeCompare(b.id || '');
                    });

                    // Link Tool Results (Smart Merge)
                    const linkedMessages = messages.map(msg => {
                        if (msg.role === 'assistant' && msg.toolInvocations) {
                            return {
                                ...msg,
                                toolInvocations: msg.toolInvocations.map((tool) => {
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
                                        } catch { /* ignore */ }

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
                    setLoadedForSessionId(sessionId as string);
                    setIsLoading(false);
                }, (err) => {
                    // During logout, there is a brief window where auth.currentUser is null
                    // but the existing Firestore listener hasn't been cleaned up yet.
                    // Firestore fires 'permission-denied' during this window.
                    // We suppress it here — the listener will be unsubscribed on the next
                    // React render when shouldFetch becomes false.
                    if (err.code === 'permission-denied' && !auth.currentUser) {
                        return;
                    }
                    console.error('[useChatHistory] Snapshot Error:', err);
                    setError(err);
                    setIsLoading(false);
                });

            } catch (err: unknown) {
                console.error('[useChatHistory] Setup Error:', err);
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            }
        }

        setupListener();

        return () => {
            isMounted = false;
            if (unsubscribe) unsubscribe();
        };
    }, [sessionId, shouldFetch, limit, authLoading]);

    const historyLoaded = !isLoading && !authLoading;

    return {
        historyLoaded,
        loadedForSessionId,
        historyMessages,
        isLoading,
        error,
        mutate: () => { } // No-op for realtime
    };
}
