'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage as Message } from 'ai';
import { ChatContext } from '@/hooks/useChatContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { auth, appCheck } from '@/lib/firebase';
import { getToken } from 'firebase/app-check';

import { GlobalAuthListener } from '@/components/auth/GlobalAuthListener';

const WELCOME_MESSAGE = {
    id: 'welcome-msg',
    role: 'assistant',
    parts: [{ type: 'text', text: "✨ **Ciao! Sono Syd**, il tuo assistente per la ristrutturazione. ✨\n\nEcco cosa posso fare per aiutarti a realizzare il tuo progetto:\n\n\n📋 **1. Creare preventivo veloce:**\n_Ottieni subito una stima dei costi._\n\n\n🎨 **2. Creare un rendering gratuito:**\n_Visualizza in anteprima le tue idee._\n\n\n💡 **3. Fornire informazioni dettagliate:**\n_Chiedi consigli su materiali e design._\n\n\n👇 **Come posso aiutarti oggi?**" }],
    createdAt: new Date()
} as unknown as Message;

interface StreamData {
    type: string;
    payload?: unknown;
    [key: string]: unknown;
}

/**
 * ChatProvider
 *
 * Orchestrates the global chat state for the application.
 * Manages the connection between the UI (ChatWidget) and the AI Backend.
 *
 * AI SDK v6 Migration:
 * - Uses DefaultChatTransport for api/headers/body configuration
 * - sendMessage uses { text: string } format (not { content, role })
 * - No more `data` return — use onData callback for streaming metadata
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
    const { user, refreshToken, isInitialized, signInAnonymously } = useAuth();

    // -- STATE --
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [isRestoringHistory, setIsRestoringHistory] = useState<boolean>(false);
    const [input, setInput] = useState<string>(''); // Local input state
    const welcomeInjectedRef = useRef(false);
    const isFirstSyncRef = useRef(true);
    const prevUserRef = useRef(user);

    // -- STABLE SESSION ID (L3 Persistent Guest) --
    const [stableGuestId, setStableGuestId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const key = 'chatSessionId';
            let id = localStorage.getItem(key);
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem(key, id);
            }
            const timerId = setTimeout(() => {
                setStableGuestId(id);
            }, 0);
            return () => clearTimeout(timerId);
        }
    }, []);

    // prevUserRef tracks auth state transitions to detect logout.
    // The actual cleanup effect is defined AFTER useChat (needs setMessages).

    // Derived Session ID
    // Anonymous Firebase users keep using stableGuestId to prevent useChat reset
    // when signInAnonymously() completes mid-message (would wipe all messages).
    const sessionId = useMemo(() => {
        if (!user || user.isAnonymous) return stableGuestId || 'guest-loading';
        return currentProjectId || `global-${user.uid}`;
    }, [user, currentProjectId, stableGuestId]);

    // Reset per-session refs when sessionId changes.
    useEffect(() => {
        welcomeInjectedRef.current = false;
        isFirstSyncRef.current = true;
    }, [sessionId]);

    // -- HISTORY SYNC --
    const { historyMessages, historyLoaded, loadedForSessionId } = useChatHistory(sessionId);

    // -- DYNAMIC HEADERS/BODY RESOLVER --
    // AI SDK v6: transport headers/body can be async functions (Resolvable)
    const resolveHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = {};

        // Primary: use the managed refreshToken (uses auth.currentUser || user state)
        let token = await refreshToken();

        // ⚡ Fallback: If refreshToken returned null (e.g. state hasn't re-rendered yet after
        // anonymous sign-in), try auth.currentUser directly from the Firebase SDK.
        // This bridges the window between signInAnonymously() resolving and React re-rendering.
        if (!token && auth.currentUser) {
            console.log('[ChatProvider] refreshToken returned null, falling back to auth.currentUser.getIdToken()');
            try {
                token = await auth.currentUser.getIdToken();
            } catch (fallbackErr) {
                console.error('[ChatProvider] Fallback getIdToken failed:', fallbackErr);
            }
        }

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('[ChatProvider] ⚠️ No token available for Authorization header — request may fail with 401');
        }

        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true' && appCheck) {
            try {
                const result = await getToken(appCheck, false);
                if (result.token) {
                    headers['X-Firebase-AppCheck'] = result.token;
                }
            } catch (err) {
                console.error('[ChatProvider] App Check token error:', err);
            }
        }
        return headers;
    }, [refreshToken]);

    // -- AI SDK v6 HOOK --
    // NOTE: DefaultChatTransport does NOT accept `body` as a function.
    // Dynamic body fields must be injected via `prepareSendMessagesRequest`.
    const transport = useMemo(() => new DefaultChatTransport({
        api: '/api/chat',
        headers: resolveHeaders,
        prepareSendMessagesRequest: ({ id, messages, body: sdkBody }) => {
            // sdkBody = { ...transport.body (static), ...options.body (per-request) }
            // options.body carries mediaUrls, mediaMetadata, videoFileUris from ChatWidget.
            const extra = (sdkBody ?? {}) as Record<string, unknown>;
            const body: Record<string, unknown> = {
                id,
                messages,
                ...extra,
                projectId: currentProjectId,
                is_authenticated: !!user && !user.isAnonymous,
                sessionId,
            };

            const msgs = body.messages as Message[];
            const lastMsg = msgs?.[msgs.length - 1];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lastMsgAny = lastMsg as any;
            const lastMsgContent = lastMsg
                ? (typeof lastMsgAny.content === 'string'
                    ? lastMsgAny.content
                    : lastMsgAny.parts?.[0]?.text || '')
                : '';

            console.log('[ChatProvider] prepareSendMessagesRequest body:', JSON.stringify({
                sessionId: body.sessionId,
                messagesCount: msgs?.length,
                projectId: body.projectId,
                is_authenticated: body.is_authenticated,
                lastMessageRole: lastMsg?.role,
                lastMessageContent: String(lastMsgContent).substring(0, 50),
                mediaUrlsCount: Array.isArray(body.mediaUrls) ? (body.mediaUrls as unknown[]).length : 0,
            }));
            return { body };
        },
    }), [resolveHeaders, currentProjectId, user, sessionId]);


    const chatHelpers = useChat({
        id: sessionId,
        transport,
        onFinish(message) {
            console.log('[ChatProvider] Turn finished. Last message:', message);
        },
        onError: (err) => {
            console.error('[ChatProvider] SDK Error:', err);
        },
    });

    const {
        messages,
        status,
        sendMessage: sdkSendMessage,
        regenerate,
        stop,
        setMessages,
        error: sdkError,
    } = chatHelpers;

    // React AI SDK 3.0.5 doesn't fully type the 'data' property on useChat. 
    // However, the internal implementation does expose it when streaming custom data chunks.
    const useChatData = (chatHelpers as { data?: StreamData[] }).data;
    useEffect(() => {
        console.log('[ChatProvider Debug] SDK messages updated:', messages.length, messages.map(m => m.id));
    }, [messages]);

    // When an authenticated user logs out, clear the AI SDK messages immediately and
    // generate a fresh guest session ID. This prevents stale authenticated chat history
    // from being shown in the anonymous session.
    // - setMessages([]) clears the AI SDK state (independent of Firestore)
    // - setStableGuestId(newUUID) changes the sessionId, triggering a fresh Firestore listener
    // - localStorage was already cleared by AuthProvider.logout() (privacy)
    useEffect(() => {
        const wasAuthenticated = prevUserRef.current && !prevUserRef.current.isAnonymous;
        const isNowLoggedOut = !user || user.isAnonymous;
        if (wasAuthenticated && isNowLoggedOut) {
            // Use setTimeout to avoid cascading renders during effect cleanup/transition
            setTimeout(() => {
                setMessages([]);
                setCurrentProjectId(null);    // prevent backend receiving stale projectId
                setStableGuestId(crypto.randomUUID());
            }, 0);
        }
        prevUserRef.current = user;
    }, [user, setMessages]);

    const isLoading = status === 'streaming' || status === 'submitted';

    // Sync History to SDK State
    useEffect(() => {
        let timerId: NodeJS.Timeout;

        // STALE DATA GUARD: historyMessages is only valid once loadedForSessionId matches
        // the current sessionId. During a session transition, the Firestore snapshot for the
        // new session hasn't fired yet, so historyMessages still holds data from the previous
        // session. Syncing it would re-populate the chat with old messages.
        if (loadedForSessionId !== sessionId) {
            return;
        }

        // RACE CONDITION GUARD: Status 'ready' means useChat just finished a request.
        // In local dev, there might be a lag between saving to Firestore and onSnapshot firing.
        // We don't want to revert to an empty history while waiting for that snapshot.
        const isRecentlyFinished = status === 'ready' && messages.length > 0;

        if (historyLoaded && status !== 'streaming' && status !== 'submitted') {
            // ALWAYS prepend the welcome message to the history so it persists
            const fullHistory = [WELCOME_MESSAGE, ...(historyMessages as unknown as Message[])];

            // 1. Cold Start (Welcome Message)
            if (historyMessages.length === 0 && messages.length === 0 && !welcomeInjectedRef.current) {
                console.log('[ChatProvider] Cold start: Injecting welcome message.');
                welcomeInjectedRef.current = true;

                timerId = setTimeout(() => {
                    setMessages(fullHistory);
                }, 0);
                return () => clearTimeout(timerId);
            }

            // Skip sync if we injected the welcome message and history is empty
            if (welcomeInjectedRef.current && historyMessages.length === 0) {
                return;
            }

            // 2. Synchronization Logic
            const sdkLen = messages.length;
            const histLen = fullHistory.length;
            const needsSync = sdkLen !== histLen || (sdkLen > 0 && histLen > 0 && messages[sdkLen - 1].id !== fullHistory[histLen - 1].id);

            if (needsSync) {
                if (isFirstSyncRef.current) {
                    console.log(`[ChatProvider] Initial history sync (${histLen} messages)`);
                    timerId = setTimeout(() => setMessages(fullHistory), 0);
                    isFirstSyncRef.current = false;
                    return () => clearTimeout(timerId);
                }

                // Optimization: If lengths are equal and the last message content is identical,
                // just adopt the Firestore IDs without a full state rebuild.
                if (sdkLen === histLen && sdkLen > 0) {
                    const lastSdk = messages[sdkLen - 1];
                    const lastHist = fullHistory[histLen - 1];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const sdkMsg = lastSdk as any;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const histMsg = lastHist as any;
                    const sdkContent = typeof sdkMsg.content === 'string' ? sdkMsg.content : sdkMsg.parts?.[0]?.text || '';
                    const histContent = typeof histMsg.content === 'string' ? histMsg.content : histMsg.parts?.[0]?.text || '';

                    if (sdkContent === histContent) {
                        console.log('[ChatProvider] Adopting Firestore IDs (ID update only).');
                        timerId = setTimeout(() => setMessages(fullHistory), 0);
                        return () => clearTimeout(timerId);
                    }
                }

                // RACE CONDITION GUARD: Wait for history to catch up if we just finished streaming.
                if (isRecentlyFinished && histLen < sdkLen) {
                    console.log('[ChatProvider] Sync Guard: Waiting for history snapshot...');
                    return;
                }

                // If history is longer, it's definitive (another device or backend update)
                console.log(`[ChatProvider] History Sync (Mismatch: SDK ${sdkLen} vs Hist ${histLen})`);
                timerId = setTimeout(() => {
                    setMessages(fullHistory);
                }, 0);
                return () => clearTimeout(timerId);
            }

        }
    }, [historyLoaded, historyMessages, loadedForSessionId, sessionId, setMessages, status, messages]);

    // -- ADK HITL INTERRUPT HANDLER --
    useEffect(() => {
        const currentData = (useChatData as StreamData[]) || [];
        if (currentData.length > 0) {
            const latestData = currentData[currentData.length - 1];
            if (latestData && latestData.type === 'interrupt') {
                console.log('[ChatProvider] ADK Interrupt Received:', latestData);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adk-interrupt', { detail: latestData.payload }));
                }
            }
        }
    }, [useChatData]);

    // -- PERSISTENCE: Save/Restore Last Project --
    useEffect(() => {
        if (isInitialized && user && !user.isAnonymous && !currentProjectId) {
            const key = `last_active_project:${user.uid}`;
            const lastId = localStorage.getItem(key);
            if (lastId) {
                console.log('[ChatProvider] Restoring last active project:', lastId);
                const timerId = setTimeout(() => {
                    setCurrentProjectId(lastId);
                }, 0);
                return () => clearTimeout(timerId);
            }
        }
    }, [isInitialized, user, currentProjectId]);

    // Save Effect
    useEffect(() => {
        if (user && !user.isAnonymous && currentProjectId) {
            const key = `last_active_project:${user.uid}`;
            localStorage.setItem(key, currentProjectId);
        }
    }, [user, currentProjectId]);

    // -- HANDLERS --
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    // -- FACADE: Flexible Send Message --
    // attachments: array of Firebase Storage URLs (strings) for images
    const sendMessage = useCallback(async (content: string, attachments?: string[], data?: Record<string, unknown>) => {
        const trimmed = content.trim();
        const hasAttachments = attachments && attachments.length > 0;

        if ((!trimmed || trimmed === '...') && !hasAttachments) {
            console.warn('[ChatProvider] Blocked empty/invalid message send:', { content, attachments });
            return;
        }

        try {
            // Anonymous sign-in if guest — MUST happen BEFORE sending
            if (!user) {
                console.log('[ChatProvider] No user found, attempting anonymous sign-in...');
                await signInAnonymously();
                console.log('[ChatProvider] Anonymous sign-in completed');

                // ⚡ CRITICAL: Force token hydration before transport resolveHeaders() runs.
                // signInAnonymously() resolves when Firebase has the User object, but the
                // ID token may not be cached yet. Calling getIdToken() here warms the local
                // token cache so that the next call inside refreshToken() returns instantly
                // instead of racing with the network — preventing a 401 from the Next.js proxy.
                if (auth.currentUser) {
                    try {
                        await auth.currentUser.getIdToken();
                        console.log('[ChatProvider] ✅ Token pre-warmed after anonymous sign-in');
                    } catch (tokenErr) {
                        console.error('[ChatProvider] ⚠️ Token pre-warm failed, sending anyway:', tokenErr);
                    }
                }
            }

            // Optimistic UI: Clear input immediately
            setInput('');

            // Build FileUIPart[] for AI SDK v6 — these populate message.parts with type:'file'
            // which MessageItem reads to render image thumbnails in the user bubble.
            const files = hasAttachments
                ? attachments!.map(url => ({
                    type: 'file' as const,
                    mediaType: 'image/jpeg',
                    url,
                }))
                : undefined;

            // AI SDK v6: sendMessage({ text, files }, { body, headers })
            // Transport-level headers/body are resolved automatically,
            // request-level options here override/extend them.
            const requestBody = {
                ...data,
            };

            await sdkSendMessage(
                { text: trimmed, files },
                { body: requestBody }
            );
        } catch (err) {
            console.error('[ChatProvider] SendMessage Error:', err);
            throw err;
        }
    }, [user, signInAnonymously, sdkSendMessage]);

    // Unified submit handler
    const handleSubmit = useCallback(async (e?: FormEvent) => {
        if (e) e.preventDefault();
        await sendMessage(input);
    }, [input, sendMessage]);

    const submitMessage = handleSubmit;

    // Force refresh history
    // F5 FIX: properly reset isRestoringHistory after sync completes
    const refreshHistory = useCallback(async () => {
        setIsRestoringHistory(true);
        console.log('[ChatProvider] Refresh requested');
        // Allow the history sync effect to run, then reset the flag
        setTimeout(() => setIsRestoringHistory(false), 1000);
    }, []);

    // -- CONTEXT VALUE --
    const value = useMemo(() => ({
        currentProjectId,
        setProjectId: setCurrentProjectId,
        isRestoringHistory,
        isLoading,
        messages,
        input,
        handleInputChange,
        submitMessage,
        sendMessage,
        error: sdkError,
        reload: regenerate,
        stop,
        setInput,
        refreshHistory,
        data: (useChatData as StreamData[]) || [],
    }), [
        currentProjectId,
        isRestoringHistory,
        isLoading,
        messages,
        input,
        handleInputChange,
        submitMessage,
        sendMessage,
        sdkError,
        regenerate,
        stop,
        setInput,
        refreshHistory,
        useChatData,
    ]);

    return (
        <ChatContext.Provider value={value}>
            {children}
            <GlobalAuthListener />
        </ChatContext.Provider>
    );
}
