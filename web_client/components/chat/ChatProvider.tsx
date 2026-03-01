'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { ChatContext } from '@/hooks/useChatContext';
import { useAuth } from '@/hooks/useAuth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { appCheck } from '@/lib/firebase';
import { getToken } from 'firebase/app-check';

import { GlobalAuthListener } from '@/components/auth/GlobalAuthListener';

/**
 * ChatProvider
 *
 * Orchestrates the global chat state for the application.
 * Manages the connection between the UI (ChatWidget) and the AI Backend.
 *
 * Key Features:
 * 1. **Singleton State**: Shared across Dashboard and Project pages.
 * 2. **Context Switching**: Handles switching between Global and Project-specific chats.
 * 3. **Ghosting Prevention**: Clears state immediately on switch (with skeleton loader).
 * 4. **Robustness**: Forces `projectId` in every request body.
 * 5. **Cold Start**: Injects welcome message if history is empty.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
    const { user, refreshToken, isInitialized, signInAnonymously } = useAuth();

    // -- STATE --
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [isRestoringHistory, setIsRestoringHistory] = useState<boolean>(false);
    const [input, setInput] = useState<string>(''); // Local input state
    const welcomeInjectedRef = useRef(false);
    const isFirstSyncRef = useRef(true);

    // -- STABLE SESSION ID (L3 Persistent Guest) --
    const [stableGuestId, setStableGuestId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const key = 'chatSessionId';
            let id = localStorage.getItem(key);
            if (!id) {
                // Use crypto.randomUUID() for high entropy standard
                id = crypto.randomUUID();
                localStorage.setItem(key, id);
            }
            // Wrap in timeout to avoid sync setState warning
            const timerId = setTimeout(() => {
                setStableGuestId(id);
            }, 0);
            return () => clearTimeout(timerId);
        }
    }, []);

    // Derived Session ID
    const sessionId = useMemo(() => {
        if (!user) return stableGuestId || 'guest-loading';
        return currentProjectId || `global-${user.uid}`;
    }, [user, currentProjectId, stableGuestId]);

    // -- AI SDK HOOK --
    // -- HISTORY SYNC --
    const { historyMessages, historyLoaded } = useChatHistory(sessionId);

    const {
        messages,
        status,
        sendMessage: sdkSendMessage,
        regenerate,
        stop,
        setMessages,
        error: sdkError,
        data, // ⚡ Capture Data Stream
    } = useChat({
        // api: '/api/chat', // implied default
        id: sessionId,
        // keepLastMessageOnError: true, // Removed as not in type in v3
        async onFinish() {
            console.log('[ChatProvider] Turn finished.');
        },
        onError: (err) => {
            console.error('[ChatProvider] SDK Error:', err);
        }
    }) as any; // 🛡️ Temporary cast until SDK types resolve

    const isLoading = status === 'streaming' || status === 'submitted';

    // Sync History to SDK State
    useEffect(() => {
        let timerId: NodeJS.Timeout;

        // Only sync if history is loaded and we are not currently generating (to avoid overwriting stream)
        // We allow overwriting if 'ready' to ensure we have the canonical DB state (Ids, timestamps)
        if (historyLoaded && status !== 'streaming' && status !== 'submitted') {
            // 1. Cold Start (Welcome Message) — check FIRST to avoid sync loop
            if (historyMessages.length === 0 && messages.length === 0 && !welcomeInjectedRef.current) {
                console.log('[ChatProvider] Cold start: Injecting welcome message.');
                welcomeInjectedRef.current = true;

                timerId = setTimeout(() => {
                    setMessages([{
                        id: 'welcome-msg',
                        role: 'assistant',
                        content: "Ciao! Sono Syd, il tuo assistente per la ristrutturazione. Ecco cosa posso fare per te:\n\n1. ⚡ **Creare preventivo veloce**\n2. 🎨 **Creare un rendering gratuito**\n3. ℹ️ **Fornire informazioni dettagliate**\n\nCome posso aiutarti oggi?",
                        createdAt: new Date()
                    } as any]);
                }, 0);
                return () => clearTimeout(timerId);
            }

            // Skip sync if we injected the welcome message and history is empty
            if (welcomeInjectedRef.current && historyMessages.length === 0) {
                return;
            }

            // 2. Length mismatch
            if (messages.length !== historyMessages.length) {
                if (!isFirstSyncRef.current) {
                    console.log(`[ChatProvider] Syncing history (length mismatch: ${messages.length} vs ${historyMessages.length})`);
                }

                timerId = setTimeout(() => {
                    setMessages(historyMessages);
                }, 0);
                isFirstSyncRef.current = false;
                return () => clearTimeout(timerId);
            }

            // 3. Content/ID mismatch on the last message (deep check not needed for efficiency)
            if (messages.length > 0) {
                const lastSdk = messages[messages.length - 1];
                const lastHistory = historyMessages[historyMessages.length - 1];

                // If IDs differ, or if history has tool results that SDK doesn't (SDK might have raw tool cells)
                if (lastSdk.id !== lastHistory.id) {
                    console.log(`[ChatProvider] Syncing history (ID mismatch: ${lastSdk.id} vs ${lastHistory.id})`);
                    timerId = setTimeout(() => {
                        setMessages(historyMessages);
                    }, 0);
                    return () => clearTimeout(timerId);
                }
            }
        }
    }, [historyLoaded, historyMessages, sessionId, setMessages, status, messages.length]); // Dependencies optimized

    // -- ADK HITL INTERRUPT HANDLER --
    useEffect(() => {
        if (data && data.length > 0) {
            const latestData = data[data.length - 1] as any;
            if (latestData && latestData.type === 'interrupt') {
                console.log('[ChatProvider] 🛑 ADK Interrupt Received:', latestData);
                // Dispatch a custom event that the UI (e.g., ChatWidget) can listen to
                // to show the Quote Approval dialog
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adk-interrupt', { detail: latestData.payload }));
                }
            }
        }
    }, [data]);

    // -- PERSISTENCE: Save/Restore Last Project --
    useEffect(() => {
        if (!user || user.isAnonymous) return;

        // Restore
        if (!currentProjectId && !isInitialized) { // Waiting validation
            // do nothing
        }
    }, [user, currentProjectId, isInitialized]);

    // Restore Effect
    useEffect(() => {
        if (isInitialized && user && !user.isAnonymous && !currentProjectId) {
            const key = `last_active_project:${user.uid}`;
            const lastId = localStorage.getItem(key);
            if (lastId) {
                console.log('[ChatProvider] Restoring last active project:', lastId);
                // Wrap in timeout to avoid sync setState warning
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

    // 🛡️ ROBUSTNESS: Force projectId in the headers/body
    // Enhanced to use auth.currentUser fallback for race condition resilience
    const getRequestOptions = useCallback(async () => {
        const headers: Record<string, string> = {};

        // Always try to get a token (refreshToken now has currentUser fallback)
        const token = await refreshToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else if (!user) {
            console.warn('[ChatProvider] No token available for guest request');
        }

        // 🔒 App Check token injection (required in production)
        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
            if (appCheck) {
                try {
                    const result = await getToken(appCheck, false);
                    if (result.token) {
                        headers['X-Firebase-AppCheck'] = result.token;
                    }
                } catch (err) {
                    console.error('[ChatProvider] App Check token error:', err);
                }
            } else {
                console.warn('[ChatProvider] appCheck instance unavailable');
            }
        }

        return {
            headers,
            body: {
                projectId: currentProjectId,
                is_authenticated: !!user,
                sessionId // ⚡ Vital for Backend Validation
            }
        };
    }, [user, refreshToken, currentProjectId, sessionId]);

    // -- FACADE: Flexible Send Message (for Attachments) --
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendMessage = useCallback(async (content: string, attachments?: any[], data?: any) => {
        // 🛡️ STRICT GUARD: Prevent empty loops and "..." auto-sends
        const trimmed = content.trim();
        const hasAttachments = attachments && attachments.length > 0;

        if ((!trimmed || trimmed === '...') && !hasAttachments) {
            console.warn('[ChatProvider] Blocked empty/invalid message send:', { content, attachments });
            return;
        }

        try {
            // ⚡ Anonymous sign-in if guest attempt - MUST happen BEFORE getRequestOptions
            if (!user) {
                console.log('[ChatProvider] No user found, attempting anonymous sign-in...');
                await signInAnonymously();
                console.log('[ChatProvider] Anonymous sign-in completed, proceeding with message send');
            }

            // ⚡ Get request options AFTER sign-in to ensure token is available
            const options = await getRequestOptions();

            const mergedBody = {
                ...options.body,
                ...data,
                experimental_attachments: attachments
            };

            // ⚡ OPTIMISTIC UI: Clear input immediately to prevent "stuck text"
            setInput('');

            await sdkSendMessage({
                content: content,
                role: 'user'
            } as any, {
                body: mergedBody,
                headers: options.headers,
            });
            // Input already cleared
        } catch (err) {
            console.error('[ChatProvider] SendMessage Error:', err);
            // Re-throw if needed, or handle gracefully
            throw err;
        }
    }, [user, signInAnonymously, sdkSendMessage, getRequestOptions, setInput]);

    // -- HANDLERS --
    // Unified submit handler that uses the Facade
    const handleSubmit = useCallback(async (e?: FormEvent) => {
        if (e) e.preventDefault();
        // Use the robust sendMessage which includes Guards
        await sendMessage(input);
    }, [input, sendMessage]);

    const submitMessage = handleSubmit;

    // Force refresh history
    const refreshHistory = useCallback(async () => {
        setIsRestoringHistory(true);
        console.log('Refresh requested');
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
        data // ⚡ EXPOSE DATA STREAM for CoT
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
        data
    ]);

    return (
        <ChatContext.Provider value={value}>
            {children}
            <GlobalAuthListener />
        </ChatContext.Provider>
    );
}

