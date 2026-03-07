'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage as Message } from 'ai';
import { ChatContext } from '@/hooks/useChatContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { auth, appCheck } from '@/lib/firebase';
import { getToken } from 'firebase/app-check';
import type { Attachment } from '@/types/chat';

import { GlobalAuthListener } from '@/components/auth/GlobalAuthListener';

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
        prepareSendMessagesRequest: ({ id, messages, requestMetadata }) => {
            const body = {
                id,
                messages,
                ...((requestMetadata as Record<string, unknown>) ?? {}),
                projectId: currentProjectId,
                is_authenticated: !!user && !user.isAnonymous,
                sessionId,
            };

            const lastMsg = body.messages?.[body.messages?.length - 1];
            const lastMsgContent = lastMsg ? (typeof (lastMsg as any).content === 'string' ? (lastMsg as any).content : (lastMsg as any).parts?.[0]?.text || '') : '';

            console.log('[ChatProvider] prepareSendMessagesRequest body:', JSON.stringify({
                sessionId: body.sessionId,
                messagesCount: body.messages?.length,
                projectId: body.projectId,
                is_authenticated: body.is_authenticated,
                lastMessageRole: lastMsg?.role,
                lastMessageContent: String(lastMsgContent).substring(0, 50),
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
    const useChatData = (chatHelpers as any).data;
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
            setMessages([]);
            setCurrentProjectId(null);    // prevent backend receiving stale projectId
            setStableGuestId(crypto.randomUUID());
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
            // 1. Cold Start (Welcome Message)
            if (historyMessages.length === 0 && messages.length === 0 && !welcomeInjectedRef.current) {
                console.log('[ChatProvider] Cold start: Injecting welcome message.');
                welcomeInjectedRef.current = true;

                timerId = setTimeout(() => {
                    setMessages([{
                        id: 'welcome-msg',
                        role: 'assistant',
                        parts: [{ type: 'text', text: "Ciao! Sono Syd, il tuo assistente per la ristrutturazione. Ecco cosa posso fare per te:\n\n1. **Creare preventivo veloce**\n2. **Creare un rendering gratuito**\n3. **Fornire informazioni dettagliate**\n\nCome posso aiutarti oggi?" }],
                        createdAt: new Date()
                    } as unknown as Message]);
                }, 0);
                return () => clearTimeout(timerId);
            }

            // Skip sync if we injected the welcome message and history is empty
            if (welcomeInjectedRef.current && historyMessages.length === 0) {
                return;
            }

            // 2. Synchronization Logic
            if (messages.length !== historyMessages.length || (messages.length > 0 && historyMessages.length === messages.length && messages[messages.length - 1].id !== historyMessages[historyMessages.length - 1].id)) {

                if (isFirstSyncRef.current) {
                    // Always trust history on first load of a session
                    console.log(`[ChatProvider] Initial history sync (${historyMessages.length} messages)`);
                    timerId = setTimeout(() => setMessages(historyMessages as unknown as Message[]), 0);
                    isFirstSyncRef.current = false;
                    return () => clearTimeout(timerId);
                }

                // RACE CONDITION GUARD: Prevent stale history from overwriting local live messages.
                // If the status is 'ready', it means we just finished a stream. 
                // We should WAIT for history to catch up (become equal or longer) before syncing.
                if (isRecentlyFinished && historyMessages.length < messages.length) {
                    console.log('[ChatProvider] Sync Guard: Waiting for history to catch up to live messages...');
                    return;
                }

                // If local is longer and NOT recently finished, something is wrong (maybe history sync failed?)
                // But we still don't want to lose local messages unless history specifically has them.
                if (historyMessages.length < messages.length) {
                    return;
                }

                // If lengths are equal but IDs differ, check if content is actually the same
                // (Optimistic IDs from useChat might differ from Firestore IDs)
                if (messages.length === historyMessages.length) {
                    const lastSdk = messages[messages.length - 1];
                    const lastHistory = historyMessages[historyMessages.length - 1];
                    const sdkContent = typeof (lastSdk as any).content === 'string' ? (lastSdk as any).content : (lastSdk as any).parts?.[0]?.text || '';
                    const historyContent = lastHistory.content || '';

                    if (sdkContent === historyContent) {
                        // Content matches, just different IDs. Don't trigger a jarring state reset.
                        // We update the messages anyway to adopt the definitive Firestore IDs.
                        console.log('[ChatProvider] Adopting Firestore IDs for identical content.');
                        timerId = setTimeout(() => setMessages(historyMessages as unknown as Message[]), 0);
                        return () => clearTimeout(timerId);
                    }
                }

                // If history is longer, another device/tab added a message, or backend injected something.
                console.log(`[ChatProvider] Syncing history (mismatch: SDK ${messages.length} vs Hist ${historyMessages.length})`);
                timerId = setTimeout(() => {
                    setMessages(historyMessages as unknown as Message[]);
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
    const sendMessage = useCallback(async (content: string, attachments?: Attachment[], data?: Record<string, unknown>) => {
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

            // AI SDK v6: sendMessage({ text }, { body, headers })
            // Transport-level headers/body are resolved automatically,
            // request-level options here override/extend them.
            const requestBody = {
                ...data,
            };

            await sdkSendMessage(
                { text: trimmed },
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
