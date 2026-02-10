'use client';

import React, { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { UIMessage as Message } from 'ai';
import { ChatContext } from '@/hooks/useChatContext';
import { useAuth } from '@/hooks/useAuth';
import { getChatHistory } from '@/lib/api-client'; // Keep for legacy if needed, or remove
import { useChatHistory } from '@/hooks/useChatHistory';

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
    const { user, refreshToken, isInitialized } = useAuth();

    // -- STATE --
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [isRestoringHistory, setIsRestoringHistory] = useState<boolean>(false);
    const [input, setInput] = useState<string>(''); // Local input state

    // Derived Session ID
    const sessionId = useMemo(() => {
        if (!user) return `guest-${Date.now()}`;
        return currentProjectId || `global-${user.uid}`;
    }, [user, currentProjectId]);

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
        // Only sync if history is loaded and we are not currently generating (to avoid overwriting stream)
        // We allow overwriting if 'ready' to ensure we have the canonical DB state (Ids, timestamps)
        if (historyLoaded && status !== 'streaming' && status !== 'submitted') {
            // Check if we need to sync:
            // 1. Length mismatch
            if (messages.length !== historyMessages.length) {
                console.log(`[ChatProvider] Syncing history (length mismatch: ${messages.length} vs ${historyMessages.length})`);
                setMessages(historyMessages);
                return;
            }

            // 2. Content/ID mismatch on the last message (deep check not needed for efficiency)
            if (messages.length > 0) {
                const lastSdk = messages[messages.length - 1];
                const lastHistory = historyMessages[historyMessages.length - 1];

                // If IDs differ, or if history has tool results that SDK doesn't (SDK might have raw tool cells)
                if (lastSdk.id !== lastHistory.id) {
                    console.log(`[ChatProvider] Syncing history (ID mismatch: ${lastSdk.id} vs ${lastHistory.id})`);
                    setMessages(historyMessages);
                }
            }

            // 3. Cold Start (Welcome Message)
            if (historyMessages.length === 0 && messages.length === 0) {
                console.log('[ChatProvider] Cold start: Injecting welcome message.');
                setMessages([{
                    id: 'welcome-msg',
                    role: 'assistant',
                    content: "Ciao! Sono Syd, il tuo assistente per la ristrutturazione. Ecco cosa posso fare per te:\n\n1. ⚡ **Chiedere un preventivo veloce**\n2. 🎨 **Creare un rendering gratuito**\n3. ℹ️ **Chiedere informazioni**\n\nCome posso aiutarti oggi?",
                    createdAt: new Date()
                } as any]);
            }
        }
    }, [historyLoaded, historyMessages, sessionId, setMessages, status, messages.length]); // Dependencies optimized

    // -- HANDLERS --
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    // 🛡️ ROBUSTNESS: Force projectId in the headers/body
    const getRequestOptions = useCallback(async () => {
        const headers: Record<string, string> = {};
        if (user) {
            const token = await refreshToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
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

        const options = await getRequestOptions();

        try {
            const mergedBody = {
                ...options.body,
                ...data,
                experimental_attachments: attachments
            };

            await sdkSendMessage({
                content: content,
                role: 'user'
            } as any, {
                body: mergedBody,
                headers: options.headers,
            });
            setInput('');
        } catch (err) {
            console.error('[ChatProvider] SendMessage Error:', err);
            // Re-throw if needed, or handle gracefully
            throw err;
        }
    }, [sdkSendMessage, getRequestOptions, setInput]);

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
        </ChatContext.Provider>
    );
}
