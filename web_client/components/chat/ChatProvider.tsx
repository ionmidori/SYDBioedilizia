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
import { auth } from '@/lib/firebase';

import { GlobalAuthListener } from '@/components/auth/GlobalAuthListener';
import { logger } from '@/lib/logger';

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

    // -- SESSION IDENTITY (persistent guest id, project, derived sessionId) --
    const {
        sessionId,
        currentProjectId,
        setCurrentProjectId,
        resetToNewGuestSession,
    } = useChatSession();

    // -- ADK CUSTOM-DATA STREAM (status / interrupt / ui_widget / artifact) --
    const { streamData, onData } = useAdkStreamEvents(sessionId);

    // -- HISTORY SYNC --
    const { historyMessages, historyLoaded, loadedForSessionId } = useChatHistory(sessionId);

    // -- AI SDK v7 TRANSPORT (auth headers + request body enrichment) --
    const transport = useChatTransport({ sessionId, currentProjectId });

    const chatHelpers = useChat({
        id: sessionId,
        transport,
        onData,
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
        // Stable useState setter from useChatSession; listed because the lint rule
        // can only prove stability for setters destructured from useState inline.
        setCurrentProjectId,
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
