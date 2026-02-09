"use client";

// Components
import { ChatHeader } from '@/components/chat/ChatHeader';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatToggleButton } from '@/components/chat/ChatToggleButton';
import { ImageLightbox } from '@/components/chat/ImageLightbox';
import { ChatErrorBoundary } from '@/components/ui/ChatErrorBoundary';
import { cn } from '@/lib/utils';

// Hooks & Utils
import { useSessionId } from '@/hooks/useSessionId';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useUpload } from '@/hooks/useUpload';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@ai-sdk/react'; // ✅ NATIVE SDK
import { useStatusQueue } from '@/hooks/useStatusQueue'; // New Hook

// Types
import { Message } from '@/types/chat';

// Custom Type Definition for SDK Compatibility
interface LegacyUseChatHelpers {
    messages: Message[];
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    error: undefined | Error;
    reload: () => Promise<string | null | undefined>;
    stop: () => void;
    setMessages: (messages: Message[]) => void;
    setInput: (input: string) => void;
    sendMessage: (message: { role: string; content: string; attachments?: unknown }, options?: unknown) => Promise<unknown>;
}

/**
 * ChatWidget Component (Modernized)
 * 
 * Refactored to use official Vercel AI SDK (`useChat`).
 * Eliminates custom stream parsing logic while preserving
 * structured media handling for the backend.
 * 
 * NOTE: Uses `sendMessage` instead of `append` due to SDK version compatibility.
 * 
 * @param projectId - Optional. If provided, ties chat to this specific project.
 *                    If omitted, uses localStorage-based session (legacy landing page).
 */
interface ChatWidgetProps {
    projectId?: string;
    variant?: 'floating' | 'inline';
}

export default function ChatWidget({ projectId, variant = 'floating' }: ChatWidgetProps) {
    return (
        <ChatErrorBoundary>
            <ChatWidgetContent projectId={projectId} variant={variant} />
        </ChatErrorBoundary>
    );
}

function ChatWidgetContent({ projectId, variant = 'floating' }: ChatWidgetProps) {
    const isInline = variant === 'inline';
    const [isOpen, setIsOpen] = useState(isInline);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);


    // State for Global Widget Synchronization
    const [syncedProjectId, setSyncedProjectId] = useState<string | undefined>(projectId);

    // Track if we've already initialized messages from history (prevent infinite loop)
    const hasInitializedFromHistory = useRef<boolean>(false);

    // Refs
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 🔒 Authentication
    const { user, refreshToken, loading: authLoading, isInitialized, signInAnonymously } = useAuth();

    // Auto sign-in anonymously for landing page chat (explicit)
    useEffect(() => {
        if (isInitialized && !user && !projectId) {
            console.log('[ChatWidget] No user after initialization, signing in anonymously for chat');
            signInAnonymously().catch((err) => {
                console.error('[ChatWidget] Failed to sign in anonymously:', err);
            });
        }
    }, [isInitialized, user, projectId, signInAnonymously]);

    // 🔄 STATE SYNC: Restore active project for Global Widget
    useEffect(() => {
        // Only run if:
        // 1. We are initialized (auth check done)
        // 2. User is logged in (Guest users don't have projects)
        // 3. We are in "Global Mode" (no explicit projectId prop)
        if (isInitialized && user && !projectId) {
            const stored = localStorage.getItem('activeProjectId');
            if (stored) {
                console.log('[ChatWidget] 🔄 Restored active project context:', stored);
                setSyncedProjectId(stored);
            }

            // 🔥 Realtime Listener for Project Switching
            const handleProjectChange = (e: CustomEvent) => {
                const newId = e.detail;
                console.log('[ChatWidget] ⚡ Realtime Project Switch:', newId);
                setSyncedProjectId(newId);
                setSelectedImage(null);
            };

            window.addEventListener('projectChanged', handleProjectChange as EventListener);
            return () => window.removeEventListener('projectChanged', handleProjectChange as EventListener);
        }
    }, [isInitialized, user, projectId]);


    // 🔗 URL SYNC: Listen to Path Changes (Back/Forward Navigation)
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!pathname) return;

        // 1. Dashboard Route: /dashboard/[id]
        const match = pathname.match(/\/dashboard\/([^\/]+)/);
        if (match && match[1]) {
            const pathId = match[1];
            if (pathId !== syncedProjectId && pathId !== 'new') {
                console.log('[ChatWidget] 🔗 URL Navigation Detected (Path):', pathId);
                setSyncedProjectId(pathId);
                localStorage.setItem('activeProjectId', pathId);
            }
        }
        // 2. Query Param: ?projectId=... (Landing Page)
        else {
            const queryId = searchParams?.get('projectId');
            if (queryId && queryId !== syncedProjectId) {
                console.log('[ChatWidget] 🔗 URL Query Detected:', queryId);
                setSyncedProjectId(queryId);
                localStorage.setItem('activeProjectId', queryId);
            }
        }
    }, [pathname, searchParams, syncedProjectId]);

    // Session Management
    // Use syncedProjectId (from prop or storage) -> Dashboard Context
    // Fallback to localStorage session -> Landing Page Context
    const fallbackSessionId = useSessionId();
    const sessionId = syncedProjectId || fallbackSessionId;

    // Load conversation history
    const { historyLoaded, historyMessages } = useChatHistory(sessionId || "");

    // 🕰️ STATUS QUEUE (New Feature)
    // Manages the "Thinking..." text with a minimum display time to prevent flickering
    const { currentStatus, addStatus, clearQueue } = useStatusQueue();

    // ✅ NATIVE AI SDK HOOK
    // We cast options to 'any' because strict types might complain about 'api'
    // but we know it works at runtime (and is standard).
    const chat = useChat({
        api: '/api/chat',
        body: {
            sessionId,
            // 🔥 AUTH INJECTION: Tell the backend if we are logged in
            is_authenticated: !!user
        },
        headers: async () => {
            const token = await refreshToken();
            return { 'Authorization': `Bearer ${token}` };
        },
        initialMessages: historyMessages,
        onResponse: (response: Response) => {
            console.log("[ChatWidget] 📡 Received API Response:", response.status, response.statusText);
            if (!response.ok) {
                console.error("[ChatWidget] ❌ API Error Headers:", Object.fromEntries(response.headers.entries()));
            }
        },
        onFinish: (message: Message) => {
            console.log("[ChatWidget] ✅ Stream Finished. Final Message:", message);
            clearQueue();
        },
        onError: (err: Error) => {
            console.error("[ChatWidget] 🔥 SDK Error:", err);
            setErrorMessage(`Errore: ${err.message || 'Connessione instabile'}`);
            clearQueue();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as LegacyUseChatHelpers;

    // Destructure from Typed Helper
    const { messages, isLoading, sendMessage, setInput, input, setMessages, data } = chat as any;

    // 📡 STATUS STREAM LISTENER
    // The Vercel SDK puts 'data' events (Protocol 2) into the `data` property.
    // We watch it and feed the queue.
    useEffect(() => {
        if (!data || data.length === 0) return;

        // Get the latest data packet
        const latest = data[data.length - 1];

        // Protocol: 2:[{"type": "status", "message": "..."}]
        // SDK parses the JSON for us.
        if (latest && typeof latest === 'object' && latest.type === 'status' && latest.message) {
            console.log('[ChatWidget] 🧠 Status Update:', latest.message);
            addStatus(latest.message);
        }
    }, [data, addStatus]);


    // 🎯 INTENT HANDLING: Trigger specific flows based on URL parameters
    useEffect(() => {
        const intent = searchParams?.get('intent');
        // Trigger if intent is 'cad' and it's a relatively new conversation
        if (intent === 'cad' && historyLoaded && !isLoading && messages.length <= 2) {
            console.log('[ChatWidget] 🎯 Triggering CAD extraction flow');

            // Use an async IIFE inside timeout to handle token retrieval
            const timeoutId = setTimeout(async () => {
                if (typeof sendMessage === 'function' && sessionId) {
                    try {
                        const token = await refreshToken();

                        await sendMessage({
                            role: 'user',
                            content: "Vorrei effettuare un rilievo CAD di questa stanza. Mi aiuti a estrarre le misure?"
                        }, {
                            body: {
                                sessionId,
                                is_authenticated: !!user
                            },
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        // Cleanup URL to avoid re-triggering on refresh
                        const params = new URLSearchParams(window.location.search);
                        params.delete('intent');
                        const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
                        window.history.replaceState({}, '', newUrl);
                    } catch (err) {
                        console.error('[ChatWidget] Failed to trigger CAD flow:', err);
                    }
                }
            }, 1000);

            return () => clearTimeout(timeoutId);
        }
    }, [searchParams, historyLoaded, isLoading, messages.length, sendMessage, sessionId, user, refreshToken]);

    // 🧹 STATE RESET: When Project/Session Changes
    useEffect(() => {
        // When switching projects, we must clear the OLD messages from the SDK state
        // The useChatHistory hook will handle loading the NEW messages for the new ID
        // But we need to ensure the UI doesn't show a mix/flash of old messages

        // 1. Reset Initialization Flag so new history can be loaded
        hasInitializedFromHistory.current = false;

        // 2. Clear SDK State
        if (typeof setMessages === 'function') {
            setMessages([]);
        }

        if (typeof setInput === 'function') {
            setInput('');
        }

        setErrorMessage(null);
        clearQueue(); // Clear any pending status
    }, [sessionId, setMessages, setInput, clearQueue]);

    // DEBUG: Inspect SDK availability
    useEffect(() => {
        if (!process.env.NEXT_PUBLIC_IS_PROD) {
            console.log("SDK Methods Check:", {
                hasSetInput: typeof setInput === 'function',
                hasSetMessages: typeof setMessages === 'function'
            });
        }
    }, [setInput, setMessages]);


    // DEBUG: Inspect hook return value
    useEffect(() => {
        console.log("[ChatWidget] Messages State:", messages.length, messages);
    }, [messages]);

    // 🌊 HYDRATION FIX: Removed duplicate sync logic that was causing infinite loops
    // History is now initialized once via the useEffect below (line ~510)

    // Welcome Message (UI Only)
    const welcomeMessage = useMemo<Message>(() => ({
        id: 'welcome',
        role: 'assistant',
        content: "Ciao! Sono **SYD**, il tuo Architetto personale. 🏗️\n\nPosso aiutarti a:\n1. 📐 **Creare un Preventivo** dettagliato.\n2. 🎨 **Visualizzare un Rendering** 3D (partendo da una tua foto o da una descrizione).\n\n💡 **Tip:** Per risultati migliori, scatta le foto in modalità **0.5x (grandangolo)**.\n\nDa dove iniziamo?",
        toolInvocations: [],
        createdAt: new Date()
    }), []);

    // Combine SDK messages with Welcome Message
    const displayMessages = useMemo(() => {
        if (historyMessages.length > 0) return messages;
        if (messages.length === 0) return [welcomeMessage];
        return messages;
    }, [historyMessages, messages, welcomeMessage]);

    // Unified Upload Hook (replaces useMediaUpload + useVideoUpload)
    const { uploads, addFiles, removeFile, retryUpload, clearAll, isUploading, successfulUploads } = useUpload({ sessionId });

    // Scroll & Viewport
    const { messagesContainerRef, messagesEndRef, scrollToBottom } = useChatScroll(displayMessages, isOpen);
    // FIX: Only activate mobile viewport logic (body lock) if NOT inline
    const { isMobile } = useMobileViewport(isOpen && !isInline, chatContainerRef);

    // 🔄 CONTEXT SWITCHING (Global Widget Only)
    const router = useRouter(); // Required for conditional navigation

    const handleProjectSwitch = (newProjectId: string) => {
        console.log('[ChatWidget] Switching context to:', newProjectId);

        // 1. Update State
        setSyncedProjectId(newProjectId);
        localStorage.setItem('activeProjectId', newProjectId);

        // 2. Clear current messages to prevent ghosting
        setMessages([]);

        // 3. Conditional Navigation (Without useTransition until build issue resolved)
        if (pathname?.startsWith('/dashboard')) {
            console.log('[ChatWidget] navigate to new dashboard project:', newProjectId);
            router.push(`/dashboard/${newProjectId}`);
        } else {
            // Landing Page / Other: Update Query Param to reflect state
            console.log('[ChatWidget] update query param:', newProjectId);
            router.push(`/?projectId=${newProjectId}`);
        }
    };

    // Typing Indicator
    const typingMessage = useTypingIndicator(isLoading);

    // File Selection - Unified handler
    const handleFileSelect = (files: File[]) => {
        if (files.length > 0) {
            addFiles(files);
        }
    };

    // ✅ Manual Input State Management (Robustness Fix)
    // We use local state as source of truth to avoid SDK `setInput` undefined issues.
    const [localInput, setLocalInput] = useState('');

    // Sync SDK input if available (optional)
    useEffect(() => {
        if (input && input !== localInput) {
            setLocalInput(input);
        }
    }, [input, localInput]);

    const handleInputChange = (val: string) => {
        setLocalInput(val);
        // Try to sync back to SDK if possible, but don't crash if missing
        if (setInput) {
            setInput(val);
        }
    };

    // SUBMIT HANDLER (The Core Logic Preservation)
    const submitMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();

        // 1. Guard Clauses
        if (isUploading || !isInitialized) return;

        const currentInput = localInput;
        const uploadItems = Object.values(uploads);
        if (!currentInput.trim() && uploadItems.length === 0) return;

        // 2. Prepare Structured Media Data from successful uploads
        const completedUploads = successfulUploads;

        // Extract URLs for images (using serverData from discriminated union)
        const mediaUrls = completedUploads
            .filter(u => u.serverData?.asset_type === 'image')
            .map(u => u.serverData!.url);

        const mediaTypes = completedUploads
            .filter(u => u.serverData?.asset_type === 'image')
            .map(u => u.serverData!.mime_type);

        // Extract File API URIs for videos
        const videoFileUris = completedUploads
            .filter(u => u.serverData?.asset_type === 'video')
            .map(u => (u.serverData as { file_uri: string }).file_uri);

        // Extract Metadata
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mediaMetadata: Record<string, any> = {};
        completedUploads.forEach(u => {
            if (u.serverData) {
                mediaMetadata[u.serverData.url] = {
                    mimeType: u.serverData.mime_type,
                    fileSize: u.serverData.size_bytes,
                    originalFileName: u.serverData.filename,
                };
            }
        });

        const dataBody = {
            mediaUrls,
            mediaTypes,
            mediaMetadata,
            videoFileUris: videoFileUris.length > 0 ? videoFileUris : undefined
        };

        // 3. Clear UI State immediately (Optimistic)
        clearAll();
        setLocalInput('');
        if (setInput) setInput('');
        setErrorMessage(null);

        // ✅ USER EXPERIENCE: Scroll to bottom immediately
        if (isOpen) scrollToBottom();

        // 4. Send Request via SDK -> Use sendMessage (since append is missing)
        // Wrapped in fire-and-forget style to not block UI
        (async () => {
            try {
                // 🔒 AUTH FIX: Fetch token explicitly for this request
                // This might take a ms, but purely background
                const token = await refreshToken();

                if (typeof sendMessage === 'function') {
                    // Using 'data' for protocol compliance.
                    // sendMessage expects an object based on previous TypeError
                    await sendMessage({
                        role: 'user',
                        content: currentInput,
                        attachments: {
                            images: mediaUrls,
                            videos: videoFileUris
                        }
                    }, {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        data: dataBody as any,
                        body: {
                            sessionId,
                            // ✅ Pass media params to Proxy/Backend (Root Level)
                            imageUrls: mediaUrls,
                            mediaUrls,
                            mediaTypes,
                            mediaMetadata,
                            videoFileUris: videoFileUris.length > 0 ? videoFileUris : undefined,
                            is_authenticated: !!user
                        },
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                } else {
                    console.error("[ChatWidget] Critical: 'sendMessage' function is missing from SDK hook!", chat);
                    setErrorMessage("Errore interno: Chat function not found. (sendMessage)");
                }
            } catch (err) {
                console.error("[ChatWidget] Send Error:", err);
                // Restore input if failed
                setLocalInput(currentInput);
                setErrorMessage("Invio fallito. Riprova.");
            }
        })();
    };

    // External Triggers (Events)
    useEffect(() => {
        const handleOpenChatWithMessage = async (e: CustomEvent<{ message?: string }>) => {
            setIsOpen(true);
            if (e.detail?.message && sendMessage && sessionId) {
                try {
                    const token = await refreshToken();
                    setTimeout(async () => {
                        await sendMessage({
                            role: 'user',
                            content: e.detail.message!
                        }, {
                            body: {
                                sessionId,
                                is_authenticated: !!user
                            },
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                    }, 500);
                } catch (err) {
                    console.error('[ChatWidget] Failed to send message from event:', err);
                }
            }
        };
        const handleOpenChat = () => setIsOpen(true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener('OPEN_CHAT_WITH_MESSAGE' as any, handleOpenChatWithMessage as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener('OPEN_CHAT' as any, handleOpenChat);

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.removeEventListener('OPEN_CHAT_WITH_MESSAGE' as any, handleOpenChatWithMessage as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.removeEventListener('OPEN_CHAT' as any, handleOpenChat);
        };
    }, [sendMessage, sessionId, refreshToken, user]); // Added dependencies

    // ✅ Sync SDK messages when history loads (Late Binding)
    useEffect(() => {
        if (historyLoaded && historyMessages.length > 0 && !hasInitializedFromHistory.current) {
            hasInitializedFromHistory.current = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setMessages(historyMessages as any[]);
        }
    }, [historyLoaded, historyMessages, setMessages]); // ✅ FIXED: Added setMessages to deps

    // 🛡️ GUARD: Prevent rendering if sessionId is not ready
    if (!sessionId || sessionId.trim().length === 0) {
        return null;
    }

    return (
        <>
            {/* Toggle Button - Hide if inline */}
            {!isInline && (
                <div className="fixed bottom-4 right-2 md:bottom-8 md:right-6 z-50 flex items-center gap-4">
                    <ChatToggleButton
                        isOpen={isOpen}
                        onClick={() => {
                            setIsOpen(!isOpen);
                        }}
                    />
                </div>
            )}

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop - Hide if inline */}
                        {!isInline && (
                            <motion.div
                                key="backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[90] bg-[#0f172a]/80 touch-none md:bg-black/40 backdrop-blur-md"
                                onClick={() => setIsOpen(false)}
                            />
                        )}

                        {/* Window */}
                        {isInline ? (
                            <div
                                ref={chatContainerRef}
                                className={cn(
                                    "bg-luxury-bg/95 backdrop-blur-xl md:border border-luxury-gold/20 flex flex-col overflow-hidden z-[100]",
                                    "relative !w-full !max-w-none h-full rounded-3xl border border-luxury-gold/10 shadow-2xl"
                                )}
                            >
                                <ChatHeader
                                    projectId={syncedProjectId}
                                    showSelector={!!user}
                                    onProjectSelect={handleProjectSwitch}
                                />
                                {renderChatContent()}
                            </div>
                        ) : (
                            <motion.div
                                key="chat-window"
                                initial={{ opacity: 0, y: "100%", scale: 1 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: "100%", scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                ref={chatContainerRef}
                                style={{
                                    height: isMobile ? '100dvh' : undefined,
                                    bottom: isMobile ? 0 : undefined,
                                    position: 'fixed'
                                }}
                                className={cn(
                                    "bg-luxury-bg/95 backdrop-blur-xl md:border border-luxury-gold/20 flex flex-col overflow-hidden z-[100]",
                                    "fixed inset-x-0 md:inset-auto md:bottom-4 md:right-6 w-full md:w-[450px] md:h-[850px] md:max-h-[calc(100vh-40px)] md:rounded-3xl shadow-2xl"
                                )}
                            >
                                <ChatHeader
                                    onMinimize={() => {
                                        setIsOpen(false);
                                    }}
                                    projectId={syncedProjectId}
                                    showSelector={!!user}
                                    onProjectSelect={handleProjectSwitch}
                                />
                                {renderChatContent()}
                            </motion.div>
                        )}
                    </>
                )}
            </AnimatePresence>

            <ImageLightbox imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
        </>
    );

    function renderChatContent() {
        return (
            <>
                <div className="flex-1 overflow-hidden p-0 flex flex-col relative">
                    {!historyLoaded && (
                        <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-luxury-gold"></div>
                        </div>
                    )}

                    <ChatMessages
                        messages={displayMessages}
                        isLoading={isLoading}
                        typingMessage={typingMessage}
                        sessionId={sessionId}
                        onImageClick={setSelectedImage}
                        messagesContainerRef={messagesContainerRef}
                        messagesEndRef={messagesEndRef}
                        statusMessage={currentStatus} // ✅ Pass dynamic status
                    />

                    {errorMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mx-4 mt-2 p-3 bg-red-900/50 border border-red-500/30 rounded-lg text-red-200 text-sm flex items-center justify-between gap-2 shadow-lg"
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                            <button
                                onClick={() => setErrorMessage(null)}
                                className="p-1 hover:bg-red-500/20 rounded-full transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </motion.div>
                    )}
                </div>

                <ChatInput
                    inputValue={localInput}
                    setInputValue={handleInputChange}
                    onSubmit={submitMessage}
                    isLoading={isLoading}
                    uploads={uploads}
                    onFileSelect={handleFileSelect}
                    onRemoveUpload={removeFile}
                    onRetryUpload={retryUpload}
                    onScrollToBottom={() => scrollToBottom('smooth')}
                    fileInputRef={fileInputRef}
                    authLoading={authLoading}
                />
            </>
        );
    }
}