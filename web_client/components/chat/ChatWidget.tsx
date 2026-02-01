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
import { useMediaUpload, MediaUploadState } from '@/hooks/useMediaUpload';
import { useVideoUpload, VideoUploadState } from '@/hooks/useVideoUpload';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@ai-sdk/react'; // ✅ NATIVE SDK

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

                // Optional: Force close sidebar if open? No, keep user preference.
                // But we MUST clear any selected image from previous project
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
    const { historyLoaded, historyMessages } = useChatHistory(sessionId);

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
        },
        onError: (err: Error) => {
            console.error("[ChatWidget] 🔥 SDK Error:", err);
            setErrorMessage(`Errore: ${err.message || 'Connessione instabile'}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as LegacyUseChatHelpers;

    // Destructure from Typed Helper
    const { messages, isLoading, sendMessage, error, setInput, input, setMessages } = chat;

    // 🧹 STATE RESET: When Project/Session Changes
    useEffect(() => {
        // When switching projects, we must clear the OLD messages from the SDK state
        // The useChatHistory hook will handle loading the NEW messages for the new ID
        // But we need to ensure the UI doesn't show a mix/flash of old messages
        if (typeof setMessages === 'function') {
            setMessages([]);
        }

        if (typeof setInput === 'function') {
            setInput('');
        }

        setErrorMessage(null);
    }, [sessionId, setMessages, setInput]);

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

    // 🌊 HYDRATION FIX: Sync DB History to SDK State
    // We trust DB (Server State) more than SDK (Client State) for history.
    useEffect(() => {
        if (!historyLoaded) return;

        const lastHistoryMsg = historyMessages[historyMessages.length - 1];
        const lastSdkMsg = messages[messages.length - 1];

        // Case 1: DB has MORE messages (Stream failed to add message)
        if (historyMessages.length > messages.length) {
            console.log(`[ChatWidget] 💧 Hydrating: DB has more messages (${historyMessages.length} > ${messages.length})`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setMessages(historyMessages as any);
        }
        // Case 2: DB has *longer* content (Stream hung empty or partial)
        else if (historyMessages.length === messages.length && lastSdkMsg && lastHistoryMsg) {
            // Only sync if it's the assistant and DB has significantly more data (>10 chars diff)
            // This prevents fighting with the active stream typing
            if (lastSdkMsg.role === 'assistant' && lastHistoryMsg.content.length > (lastSdkMsg.content.length + 10)) {
                console.log(`[ChatWidget] 💧 Hydrating: DB content richer (${lastHistoryMsg.content.length} > ${lastSdkMsg.content.length})`);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setMessages(historyMessages as any);
            }
        }
    }, [historyLoaded, historyMessages, messages, setMessages]);

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

    // Media & Video Upload Hooks
    const { mediaItems, addFiles, removeMedia, clearMedia, updateMediaItem, isGlobalUploading } = useMediaUpload(sessionId);
    const { videos, addVideos, removeVideo, clearVideos, isUploading: isVideoUploading } = useVideoUpload();

    // Scroll & Viewport
    const { messagesContainerRef, messagesEndRef, scrollToBottom } = useChatScroll(displayMessages, isOpen);
    const { isMobile } = useMobileViewport(isOpen, chatContainerRef);

    // Typing Indicator
    const typingMessage = useTypingIndicator(isLoading);

    // File Selection
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const videoFiles = files.filter(f => f.type.startsWith('video/'));
            const imageFiles = files.filter(f => f.type.startsWith('image/'));

            if (imageFiles.length > 0) addFiles(imageFiles);
            if (videoFiles.length > 0) await addVideos(videoFiles);

            e.target.value = '';
        }
    };

    // ✅ Manual Input State Management (Robustness Fix)
    // We use local state as source of truth to avoid SDK `setInput` undefined issues.
    const [localInput, setLocalInput] = useState('');

    // Sync SDK input if available (optional)
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/rules-of-hooks
    useEffect(() => {
        if (input && input !== localInput) {
            setLocalInput(input);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input]);

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
        const hasActiveUploads = mediaItems.some(i => i.status === 'uploading' || i.status === 'compressing');
        const hasActiveVideoUploads = videos.some(v => v.status === 'uploading' || v.status === 'processing');
        if (hasActiveUploads || hasActiveVideoUploads || isLoading || authLoading) return;

        const currentInput = localInput;
        if (!currentInput.trim() && mediaItems.length === 0 && videos.length === 0) return;

        // 2. Prepare Structured Media Data
        // Extract Firebase URLs
        const mediaUrls = mediaItems
            .filter((i: MediaUploadState) => i.status === 'done' && i.publicUrl)
            .map((i: MediaUploadState) => i.publicUrl!);

        const mediaTypes = mediaItems
            .filter((i: MediaUploadState) => i.status === 'done' && i.publicUrl)
            .map((i: MediaUploadState) => i.file.type);

        // Extract File API URIs (Native Video)
        const videoFileUris = videos
            .filter((v: VideoUploadState) => v.status === 'done' && v.fileUri)
            .map((v: VideoUploadState) => v.fileUri!);

        // Extract Metadata (Trim Ranges)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mediaMetadata: Record<string, any> = {};
        mediaItems.forEach(i => {
            if (i.status === 'done' && i.publicUrl && i.trimRange) {
                mediaMetadata[i.publicUrl] = { trimRange: i.trimRange };
            }
        });

        const dataBody = {
            mediaUrls,
            mediaTypes,
            mediaMetadata,
            videoFileUris: videoFileUris.length > 0 ? videoFileUris : undefined
        };

        // 3. Clear UI State immediately
        clearMedia();
        clearVideos();
        setLocalInput('');
        if (setInput) setInput('');
        setErrorMessage(null);

        // ✅ USER EXPERIENCE: Scroll to bottom immediately
        if (isOpen) scrollToBottom();

        // 4. Send Request via SDK -> Use sendMessage (since append is missing)
        try {
            // 🔒 AUTH FIX: Fetch token explicitly for this request
            const token = await refreshToken();
            console.log("[ChatWidget] Sending message with token:", token ? "Token present" : "Token missing", {
                currentInput,
                sessionId,
                dataBody
            });

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
                        videoFileUris: videoFileUris.length > 0 ? videoFileUris : undefined
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
    };

    // External Triggers (Events)
    useEffect(() => {
        const handleOpenChatWithMessage = (e: CustomEvent<{ message?: string }>) => {
            setIsOpen(true);
            if (e.detail?.message) {
                setTimeout(() => {
                    if (sendMessage) {
                        sendMessage({
                            role: 'user',
                            content: e.detail.message!
                        }, {});
                    }
                }, 500);
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
    }, [sendMessage]); // Depend on sendMessage

    // ✅ Sync SDK messages when history loads (Late Binding)
    useEffect(() => {
        if (historyLoaded && historyMessages.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setMessages(historyMessages as any[]);
        }
    }, [historyLoaded, historyMessages, setMessages]);

    // 🔄 CONTEXT SWITCHING (Global Widget Only)
    const router = useRouter(); // Required for conditional navigation

    const handleProjectSwitch = (newProjectId: string) => {
        console.log('[ChatWidget] Switching context to:', newProjectId);

        // 1. Update State
        setSyncedProjectId(newProjectId);
        localStorage.setItem('activeProjectId', newProjectId);

        // 2. Clear current messages to prevent ghosting
        setMessages([]);

        // 3. Conditional Navigation:
        // If we are already inside the dashboard, we should navigate the whole page
        // to keep the background content in sync with the chat.
        // If we are on the Landing Page, we stay there (just switching chat context).
        if (pathname?.startsWith('/dashboard')) {
            console.log('[ChatWidget] navigate to new dashboard project:', newProjectId);
            router.push(`/dashboard/${newProjectId}`);
        } else {
            // Landing Page / Other: Update Query Param to reflect state
            // This gives the user feedback that something changed "address changed"
            console.log('[ChatWidget] update query param:', newProjectId);
            router.push(`/?projectId=${newProjectId}`);
        }
    };

    return (
        <>
            {/* Toggle Button - Hide if inline */}
            {!isInline && (
                <div className="fixed bottom-4 right-2 md:bottom-8 md:right-6 z-50 flex items-center gap-4">
                    <ChatToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
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
                        <motion.div
                            key="chat-window"
                            initial={isInline ? { opacity: 0 } : { opacity: 0, y: 50, scale: 0.95 }}
                            animate={isInline ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={isInline ? { opacity: 0 } : { opacity: 0, y: 50, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            drag={(isMobile && !isInline) ? "y" : false}
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0, bottom: 0.5 }}
                            ref={chatContainerRef}
                            style={{
                                height: (isMobile && !isInline) ? '100dvh' : isInline ? '100%' : undefined,
                                top: (isMobile && !isInline) ? 0 : undefined
                            }}
                            className={cn(
                                "bg-luxury-bg/95 backdrop-blur-xl md:border border-luxury-gold/20 flex flex-col overflow-hidden z-[100]",
                                isInline
                                    ? "relative w-full h-[calc(100dvh-100px)] md:h-[calc(100vh-160px)] rounded-3xl"
                                    : "fixed inset-0 md:inset-auto md:bottom-4 md:right-6 w-full md:w-[450px] md:h-[850px] md:max-h-[calc(100vh-40px)] md:rounded-3xl shadow-2xl"
                            )}
                        >
                            <ChatHeader
                                onMinimize={isInline ? undefined : () => setIsOpen(false)}
                                projectId={syncedProjectId}
                                showSelector={!!user} // ✅ Show selector if logged in (even in Global Mode)
                                onProjectSelect={!isInline ? handleProjectSwitch : undefined}
                            />

                            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar-thin scrollbar-thumb-luxury-gold/20 hover:scrollbar-thumb-luxury-gold/40">

                                {/* History Loader */}
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
                                />

                                {/* ✅ Inline Error Alert */}
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
                                            aria-label="Chiudi errore"
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
                                isGlobalUploading={isGlobalUploading || isVideoUploading}
                                mediaItems={mediaItems}
                                onFileSelect={handleFileSelect}
                                onScrollToBottom={() => scrollToBottom('smooth')}
                                fileInputRef={fileInputRef}
                                removeMedia={removeMedia}
                                updateMediaItem={updateMediaItem}
                                authLoading={authLoading}
                            />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <ImageLightbox imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
        </>
    );
}
