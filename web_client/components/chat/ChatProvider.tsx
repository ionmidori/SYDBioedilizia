'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage as Message } from 'ai';
import { ChatContext } from '@/hooks/useChatContext';
import { ChatContextType } from '@/types/chat-context';
import { useAuth } from '@/hooks/useAuth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChatSync } from '@/hooks/useChatSync';
import { auth, appCheck } from '@/lib/firebase';
import { getToken } from 'firebase/app-check';

import { GlobalAuthListener } from '@/components/auth/GlobalAuthListener';
import { logger } from '@/lib/logger';
import { getMessageText } from '@/lib/chat/messages';

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
 * AI SDK v7 Migration:
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
    // ADK custom-data stream (status / interrupt / ui_widget / artifact / reasoning).
    // AI SDK v7 delivers transient `data-*` parts via the `onData` callback (NOT on
    // `useChat().data`, which no longer exists), so we accumulate them here.
    const [streamData, setStreamData] = useState<StreamData[]>([]);
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

    // Drop the previous session's ADK data events when sessionId changes.
    // (useChatSync owns the equivalent reset for its own per-session refs.)
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional per-session reset: drop the previous session's ADK data events when sessionId changes
        setStreamData([]);
    }, [sessionId]);

    // -- HISTORY SYNC --
    const { historyMessages, historyLoaded, loadedForSessionId } = useChatHistory(sessionId);

    // -- DYNAMIC HEADERS/BODY RESOLVER --
    // AI SDK v7: transport headers/body can be async functions (Resolvable)
    const resolveHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = {};

        // Primary: use the managed refreshToken (uses auth.currentUser || user state)
        let token = await refreshToken();

        // ⚡ Fallback: If refreshToken returned null (e.g. state hasn't re-rendered yet after
        // anonymous sign-in), try auth.currentUser directly from the Firebase SDK.
        // This bridges the window between signInAnonymously() resolving and React re-rendering.
        if (!token && auth.currentUser) {
            logger.debug('[ChatProvider] refreshToken returned null, falling back to auth.currentUser.getIdToken()');
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

    // -- AI SDK v7 HOOK --
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
                sessionId,
            };

            const msgs = body.messages as Message[];
            const lastMsg = msgs?.[msgs.length - 1];
            const lastMsgContent = getMessageText(lastMsg);

            if (process.env.NODE_ENV === 'development') {
                logger.debug('[ChatProvider] prepareSendMessagesRequest body:', JSON.stringify({
                    sessionId: body.sessionId,
                    messagesCount: msgs?.length,
                    projectId: body.projectId,
                    lastMessageRole: lastMsg?.role,
                    lastMessageContent: String(lastMsgContent).substring(0, 50),
                    mediaUrlsCount: Array.isArray(body.mediaUrls) ? (body.mediaUrls as unknown[]).length : 0,
                }));
            }
            return { body };
        },
    }), [resolveHeaders, currentProjectId, sessionId]);


    const chatHelpers = useChat({
        id: sessionId,
        transport,
        onData: (dataPart) => {
            // v7 transient `data-*` parts (ADK status/interrupt/ui_widget/artifact/reasoning).
            // The backend wraps the legacy event object (which carries its own `type`)
            // in `dataPart.data`, so unwrap it to keep downstream consumers unchanged.
            const inner = (dataPart as { data?: unknown }).data;
            if (inner && typeof inner === 'object') {
                setStreamData((prev) => [...prev, inner as StreamData]);
            }
        },
        onFinish(message) {
            logger.debug('[ChatProvider] Turn finished. Last message:', message);
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

    useEffect(() => {
        logger.debug('[ChatProvider Debug] SDK messages updated:', messages.length, messages.map(m => m.id));
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

    // -- HISTORY -> SDK STATE RECONCILIATION --
    useChatSync({
        messages,
        setMessages,
        historyMessages,
        historyLoaded,
        loadedForSessionId,
        sessionId,
        status,
    });

    // -- ADK STREAMING DATA HANDLERS (interrupt / ui_widget / artifact) --
    useEffect(() => {
        const currentData = streamData;
        if (currentData.length === 0) return;

        const latestData = currentData[currentData.length - 1];
        if (!latestData) return;

        if (latestData.type === 'interrupt') {
            logger.debug('[ChatProvider] ADK Interrupt Received:', latestData);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adk-interrupt', { detail: latestData.payload }));
            }
        }

        // ADK 1.27+ UiWidget: backend tool called tool_context.render_ui_widget()
        // Dispatch event so chat components can render native widget components
        // without relying only on the tool name string.
        if (latestData.type === 'ui_widget') {
            logger.debug('[ChatProvider] ADK UiWidget Received:', latestData);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adk-ui-widget', { detail: latestData }));
            }
        }

        // ADK 1.27+ Artifact: backend tool called tool_context.save_artifact()
        // Dispatch event so gallery/media panels can refresh to show the new artifact.
        if (latestData.type === 'artifact') {
            logger.debug('[ChatProvider] ADK Artifact Saved:', latestData);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adk-artifact', { detail: latestData }));
            }
        }
    }, [streamData]);

    // -- PERSISTENCE: Save/Restore Last Project --
    useEffect(() => {
        if (isInitialized && user && !user.isAnonymous && !currentProjectId) {
            const key = `last_active_project:${user.uid}`;
            const lastId = localStorage.getItem(key);
            if (lastId) {
                logger.debug('[ChatProvider] Restoring last active project:', lastId);
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
                logger.debug('[ChatProvider] No user found, attempting anonymous sign-in...');
                await signInAnonymously();
                logger.debug('[ChatProvider] Anonymous sign-in completed');

                // ⚡ CRITICAL: Force token hydration before transport resolveHeaders() runs.
                // signInAnonymously() resolves when Firebase has the User object, but the
                // ID token may not be cached yet. Calling getIdToken() here warms the local
                // token cache so that the next call inside refreshToken() returns instantly
                // instead of racing with the network — preventing a 401 from the Next.js proxy.
                if (auth.currentUser) {
                    try {
                        await auth.currentUser.getIdToken();
                        logger.debug('[ChatProvider] ✅ Token pre-warmed after anonymous sign-in');
                    } catch (tokenErr) {
                        console.error('[ChatProvider] ⚠️ Token pre-warm failed, sending anyway:', tokenErr);
                    }
                }
            }

            // Optimistic UI: Clear input immediately
            setInput('');

            // Build FileUIPart[] for AI SDK v7 — these populate message.parts with type:'file'
            // which MessageItem reads to render image thumbnails in the user bubble.
            const files = hasAttachments
                ? attachments!.map(url => ({
                    type: 'file' as const,
                    mediaType: 'image/jpeg',
                    url,
                }))
                : undefined;

            // AI SDK v7: sendMessage({ text, files }, { body, headers })
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
        logger.debug('[ChatProvider] Refresh requested');
        // Allow the history sync effect to run, then reset the flag
        setTimeout(() => setIsRestoringHistory(false), 1000);
    }, []);

    // -- CONTEXT VALUE --
    const value = useMemo<ChatContextType>(() => ({
        currentProjectId,
        setProjectId: setCurrentProjectId,
        isRestoringHistory,
        isLoading,
        messages,
        historyMessages,
        input,
        handleInputChange,
        submitMessage,
        sendMessage,
        error: sdkError,
        reload: regenerate,
        stop,
        setInput,
        refreshHistory,
        data: streamData,
    }), [
        currentProjectId,
        isRestoringHistory,
        isLoading,
        messages,
        historyMessages,
        input,
        handleInputChange,
        submitMessage,
        sendMessage,
        sdkError,
        regenerate,
        stop,
        setInput,
        refreshHistory,
        streamData
    ]);
    return (
        <ChatContext.Provider value={value}>
            {children}
            <GlobalAuthListener />
        </ChatContext.Provider>
    );
}
