'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { ChatContext } from '@/hooks/useChatContext';
import { ChatContextType } from '@/types/chat-context';
import { useAuth } from '@/hooks/useAuth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChatSession } from '@/hooks/useChatSession';
import { useChatSync } from '@/hooks/useChatSync';
import { useChatTransport } from '@/hooks/useChatTransport';
import { useAdkStreamEvents } from '@/hooks/useAdkStreamEvents';
import { useProjectRooms } from '@/hooks/useProjectRooms';
import { useActiveRoom } from '@/hooks/useActiveRoom';
import { useChatMoveRecovery, type SentTurn } from '@/hooks/useChatMoveRecovery';
import { useRefreshHouseQuote } from '@/hooks/use-house-quote';
import { auth } from '@/lib/firebase';

import { GlobalAuthListener } from '@/components/auth/GlobalAuthListener';
import { logger } from '@/lib/logger';
import { markChatFinish, markChatFirstText, markChatSend } from '@/lib/chat/latency';
import { hasVisibleText } from '@/lib/chat/message-text';

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
    const { user, signInAnonymously } = useAuth();

    // -- STATE --
    const [isRestoringHistory, setIsRestoringHistory] = useState<boolean>(false);
    const [input, setInput] = useState<string>(''); // Local input state
    // prevUserRef tracks auth state transitions to detect logout.
    // The actual cleanup effect is defined AFTER useChat (needs setMessages).
    const prevUserRef = useRef(user);

    // -- SESSION IDENTITY (the user's chat from the backend, or the guest id) --
    const {
        sessionId,
        userChatId,
        userChatError,
        refreshUserChat,
        resetToNewGuestSession,
    } = useChatSession();

    // -- ADK CUSTOM-DATA STREAM (status / interrupt / ui_widget / artifact) --
    const { streamData, onData } = useAdkStreamEvents(sessionId);

    // -- HISTORY SYNC --
    const { historyMessages, historyLoaded, loadedForSessionId } = useChatHistory(sessionId ?? undefined);

    // -- ROOMS (Phase 138: one chat for the whole home) --
    // Only the signed-in user's chat has rooms the client can read (owner-only
    // rules on projects/{id}); a guest chat gets no chips.
    const { rooms } = useProjectRooms(userChatId);
    const { activeRoomId, setActiveRoomId } = useActiveRoom(userChatId, rooms);

    // -- AI SDK v7 TRANSPORT (auth headers + request body enrichment) --
    const transport = useChatTransport({ sessionId, activeRoomId });

    // The agent writes the quote of the house during a turn (Phase 139 dashboard).
    const refreshHouseQuote = useRefreshHouseQuote();

    const chatHelpers = useChat({
        // No id yet (the user's chat is being asked for): a placeholder chat that
        // sendMessage never uses.
        id: sessionId ?? undefined,
        transport,
        // Batch streamed updates: one React render per 50 ms instead of one per
        // SSE chunk (the whole chat context changes on every update).
        throttle: 50,
        onData,
        onFinish(message) {
            markChatFinish();
            void refreshHouseQuote();
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

    // Latency: first assistant text visible during this turn (the leading "..."
    // placeholder chunk is not real content).
    useEffect(() => {
        if (status !== 'streaming') return;
        const last = messages[messages.length - 1];
        if (last?.role !== 'assistant') return;
        if (hasVisibleText(last.parts)) markChatFirstText();
    }, [messages, status]);

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
                resetToNewGuestSession();
            }, 0);
        }
        prevUserRef.current = user;
    }, [user, setMessages, resetToNewGuestSession]);

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

    // -- HANDLERS --
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    // -- FACADE: Flexible Send Message --
    // attachments: array of Firebase Storage URLs (strings) for images
    const lastTurnRef = useRef<SentTurn | null>(null);
    // A notice about the chat, e.g. a refused turn given back to the user.
    const [chatNotice, setChatNotice] = useState<string | null>(null);
    const sendMessage = useCallback(async (content: string, attachments?: string[], data?: Record<string, unknown>) => {
        const trimmed = content.trim();
        const hasAttachments = attachments && attachments.length > 0;

        if ((!trimmed || trimmed === '...') && !hasAttachments) {
            console.warn('[ChatProvider] Blocked empty/invalid message send:', { content, attachments });
            return;
        }
        // The chat id is not known yet (the input is disabled meanwhile).
        if (!sessionId) {
            console.warn('[ChatProvider] Blocked send before the chat id is known');
            return;
        }
        lastTurnRef.current = { content: trimmed, attachments, data };
        setChatNotice(null);

        markChatSend();
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
    }, [user, sessionId, signInAnonymously, sdkSendMessage]);

    // -- CHAT MOVED (Phase 139): a turn refused for a chat that is no longer the
    // user's goes again, once, in the chat the backend gives now --
    const lastTurn = useCallback(() => lastTurnRef.current, []);
    const resendTurn = useCallback((turn: SentTurn) => {
        void sendMessage(turn.content, turn.attachments, turn.data);
    }, [sendMessage]);
    const dismissChatNotice = useCallback(() => setChatNotice(null), []);
    const restoreTurn = useCallback((turn: SentTurn) => {
        setInput(turn.content);
        setChatNotice('La tua chat è stata aggiornata: allega di nuovo le foto o i video e invia il messaggio.');
    }, []);
    const { visibleError } = useChatMoveRecovery({
        error: sdkError,
        sessionId,
        // The new chat's history is in the SDK messages (its first sync, welcome
        // included, has run): sent earlier, the turn would be wiped by that sync.
        historyReady: historyLoaded && loadedForSessionId === sessionId && messages.length > 0,
        enabled: userChatId !== null,
        refreshUserChat,
        resend: resendTurn,
        restore: restoreTurn,
        lastTurn,
    });

    // The user's chat could not be had: say so, and "Riprova" asks again.
    const chatIdError = useMemo(
        () => (userChatError ? new Error('Non riusciamo ad aprire la tua chat. Riprova.') : undefined),
        [userChatError],
    );
    const reload = useCallback(async () => {
        if (chatIdError && !visibleError) {
            await refreshUserChat().catch(() => undefined);
            return;
        }
        await regenerate();
    }, [chatIdError, visibleError, refreshUserChat, regenerate]);

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
        sessionId,
        userChatId,
        isRestoringHistory,
        isLoading,
        messages,
        historyMessages,
        input,
        handleInputChange,
        submitMessage,
        sendMessage,
        error: visibleError ?? chatIdError,
        chatNotice,
        dismissChatNotice,
        reload,
        stop,
        setInput,
        refreshHistory,
        data: streamData,
        rooms,
        activeRoomId,
        setActiveRoomId,
    }), [
        sessionId,
        userChatId,
        isRestoringHistory,
        isLoading,
        messages,
        historyMessages,
        input,
        handleInputChange,
        submitMessage,
        sendMessage,
        visibleError,
        chatIdError,
        chatNotice,
        dismissChatNotice,
        reload,
        stop,
        setInput,
        refreshHistory,
        streamData,
        rooms,
        activeRoomId,
        setActiveRoomId,
    ]);
    return (
        <ChatContext.Provider value={value}>
            {children}
            <GlobalAuthListener />
        </ChatContext.Provider>
    );
}
