'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
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
    const [streamData, setStreamData] = useState<any[]>([]); // Replaces useChat data
    const welcomeInjectedRef = useRef(false);
    const isFirstSyncRef = useRef(true);

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
        setStreamData([]);
    }, [sessionId]);

    // -- HISTORY SYNC --
    const { historyMessages, historyLoaded } = useChatHistory(sessionId);

    // -- DYNAMIC HEADERS/BODY RESOLVER --
    // AI SDK v6: transport headers/body can be async functions (Resolvable)
    const resolveHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = {};
        const token = await refreshToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
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

    const resolveBody = useCallback((): object => {
        return {
            projectId: currentProjectId,
            is_authenticated: !!user,
            sessionId,
        };
    }, [currentProjectId, user, sessionId]);

    // -- AI SDK v6 HOOK --
    const {
        messages,
        status,
        sendMessage: sdkSendMessage,
        regenerate,
        stop,
        setMessages,
        error: sdkError,
    } = useChat({
        id: sessionId,
        transport: new DefaultChatTransport({
            api: '/api/chat',
            headers: resolveHeaders,
            body: resolveBody,
        }),
        onFinish() {
            console.log('[ChatProvider] Turn finished.');
        },
        onError: (err) => {
            console.error('[ChatProvider] SDK Error:', err);
        },
    });

    const isLoading = status === 'streaming' || status === 'submitted';

    // Sync History to SDK State
    useEffect(() => {
        let timerId: NodeJS.Timeout;

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
                    setMessages(historyMessages as any);
                }, 0);
                isFirstSyncRef.current = false;
                return () => clearTimeout(timerId);
            }

            // 3. Content/ID mismatch on the last message
            if (messages.length > 0) {
                const lastSdk = messages[messages.length - 1];
                const lastHistory = historyMessages[historyMessages.length - 1];
                if (lastSdk.id !== lastHistory.id) {
                    console.log(`[ChatProvider] Syncing history (ID mismatch: ${lastSdk.id} vs ${lastHistory.id})`);
                    timerId = setTimeout(() => {
                        setMessages(historyMessages as any);
                    }, 0);
                    return () => clearTimeout(timerId);
                }
            }
        }
    }, [historyLoaded, historyMessages, sessionId, setMessages, status, messages.length]);

    // -- ADK HITL INTERRUPT HANDLER --
    useEffect(() => {
        if (streamData.length > 0) {
            const latestData = streamData[streamData.length - 1] as any;
            if (latestData && latestData.type === 'interrupt') {
                console.log('[ChatProvider] ADK Interrupt Received:', latestData);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adk-interrupt', { detail: latestData.payload }));
                }
            }
        }
    }, [streamData]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendMessage = useCallback(async (content: string, attachments?: any[], data?: any) => {
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
            }

            // Optimistic UI: Clear input immediately
            setInput('');

            // AI SDK v6: sendMessage({ text }, { body, headers })
            // Transport-level headers/body are resolved automatically,
            // request-level options here override/extend them.
            const requestBody = {
                ...data,
                experimental_attachments: attachments,
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
        data: streamData,
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
        streamData,
    ]);

    return (
        <ChatContext.Provider value={value}>
            {children}
            <GlobalAuthListener />
        </ChatContext.Provider>
    );
}
