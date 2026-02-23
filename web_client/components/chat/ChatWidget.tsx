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
import { useChatContext } from '@/hooks/useChatContext';
import { useUpload } from '@/hooks/useUpload';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStatusQueue } from '@/hooks/useStatusQueue';

// Types
import { Message } from '@/types/chat';

/**
 * ChatWidget Component
 * 
 * The main UI shell for the Global Chat.
 * 
 * Changes in Refactor (v3):
 * - Removed `useChat` hook (now consumes `ChatContext`).
 * - Removed `useChatHistory` (handled by `ChatProvider`).
 * - Simplified state synchronization (driven by `ChatContext`).
 * - Maintains `useStatusQueue` for visual feedback using `data` from context.
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

    // 1. Consume Global Context
    const {
        currentProjectId: contextProjectId,
        setProjectId,
        messages,
        input,
        setInput,
        handleInputChange,
        sendMessage,
        isLoading,
        error,
        data,
        isRestoringHistory
    } = useChatContext();

    // 2. State & Refs
    const [isOpen, setIsOpen] = useState(isInline);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // We use a local ID for useUpload to keep file uploads separated by logic "session"
    // But realistically, the session is determined by the context.
    const { user, isInitialized } = useAuth();
    const sessionId = contextProjectId || `global-${user?.uid || 'guest'}`;

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 3. Sync Props/URL to Context State
    //    If props.projectId changes, or URL changes, we update the Global Context.

    // 3a. Sync Prop
    useEffect(() => {
        if (typeof projectId !== 'undefined' && projectId !== contextProjectId) {
            setProjectId(projectId);
        }
    }, [projectId, contextProjectId, setProjectId]);

    // 3b. Sync URL (when in Global Mode / Landing Page)
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        // Only if not explicitly controlled by prop (standard Dashboard/Global behavior)
        if (projectId) return;

        if (!pathname) return;

        // Dashboard Route: /dashboard/[id]
        const match = pathname.match(/\/dashboard\/([^\/]+)/);
        if (match && match[1]) {
            const pathId = match[1];
            if (pathId !== contextProjectId && pathId !== 'new') {
                setProjectId(pathId);
            }
        }
        // Query Param: ?projectId=... (Landing Page)
        else {
            const queryId = searchParams?.get('projectId');
            // If query param exists, sync it. If null, we might be global (null).
            // Only sync if different.
            if (queryId !== contextProjectId) {
                // If queryId is null, and we are not on dashboard, we might want to set to null (Global)
                // But avoid overwriting if we just set it manually. State driven.
                if (queryId) {
                    if (queryId) {
                        setProjectId(queryId);
                    }
                }
            }
        }
    }, [pathname, searchParams, contextProjectId, setProjectId, projectId]);

    // 4. Status Queue (Visuals)
    const { currentStatus, addStatus, clearQueue } = useStatusQueue();

    // Watch 'data' from context for status updates
    useEffect(() => {
        if (!data || data.length === 0) return;

        const latest = data[data.length - 1];
        // Protocol: 2:[{"type": "status", "message": "..."}]
        if (latest && typeof latest === 'object' && (latest as any).type === 'status' && (latest as any).message) {
            addStatus((latest as any).message);
        }
    }, [data, addStatus]);

    // Clear queue on project switch
    useEffect(() => {
        clearQueue();
        setErrorMessage(null);
    }, [contextProjectId, clearQueue]);

    // 5. Unified Upload Hook
    const { uploads, addFiles, removeFile, retryUpload, clearAll, isUploading, successfulUploads } = useUpload({ sessionId });

    // 6. Scroll & Viewport
    // We filter messages to show welcome message vs real messages
    // The Provider already handles initial welcome messages in `messages`.
    const { messagesContainerRef, messagesEndRef, scrollToBottom } = useChatScroll(messages, isOpen);
    const { isMobile, keyboardHeight } = useMobileViewport(isOpen && !isInline, chatContainerRef);

    // 7. Handlers

    // Project Switch (from Header Selector)
    const router = useRouter();
    const handleProjectSwitch = useCallback((newProjectId: string) => {
        // Update Context
        setProjectId(newProjectId);

        // Conditional Navigation
        if (pathname?.startsWith('/dashboard')) {
            router.push(`/dashboard/${newProjectId}`);
        } else {
            router.push(`/?projectId=${newProjectId}`);
        }
    }, [pathname, router, setProjectId]);

    const handleFileSelect = useCallback((files: File[]) => {
        if (files.length > 0) addFiles(files);
    }, [addFiles]);

    // Lead Form Handler
    const handleFormSubmit = useCallback((formData: any) => {
        // Send hidden message to AI to act as tool output/user confirmation
        const msg = `[LEAD_DATA_SUBMISSION] Name: ${formData.name}, Email: ${formData.email}, Phone: ${formData.contact}, Scope: ${formData.scope}`;
        sendMessage(msg);
    }, [sendMessage]);

    // Submit Handler
    const submitMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (isUploading || !isInitialized) return;
        if (!input.trim() && Object.keys(uploads).length === 0) return;

        // Prepare Media
        const completedUploads = successfulUploads;

        const mediaUrls = completedUploads
            .filter(u => u.serverData?.asset_type === 'image')
            .map(u => u.serverData!.url);

        const videoFileUris = completedUploads
            .filter(u => u.serverData?.asset_type === 'video')
            .map(u => (u.serverData as { file_uri: string }).file_uri);

        // Metadata
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
            // mediaTypes, // Provider/Backend might re-derive or we can send invalid mime types?
            // Simplest is to pass what we have.
            mediaMetadata,
            videoFileUris: videoFileUris.length > 0 ? videoFileUris : undefined
        };

        // UI Optimistic Clear
        clearAll();
        // input cleared by sendMessage typically, but we can do it here if we want optimistic clear
        // setInput('') is called by sendMessage in provider on success. 
        // We can trust provider or force it.

        // Scroll
        if (isOpen) scrollToBottom();

        try {
            await sendMessage(input,
                // Attachments (Standard Vercel SDK format for "experimental_attachments" or our custom logic)
                // Our sendMessage facade takes (content, attachments?, data?)
                // We pass images as attachments? Or just use our custom data body?
                // The ChatProvider facade maps 'attachments' to 'experimental_attachments'.
                // If we want to support image previews in user bubble via standard UI, we should pass them as attachments.
                // Current MessageItem checks 'message.attachments?.images'.
                // So we should pass generic attachments.
                mediaUrls, // This is 'any'[] in signature
                dataBody
            );
        } catch (err: any) {
            setErrorMessage(err.message || "Invio fallito.");
        }
    };

    // Typing Indicator
    const typingMessage = useTypingIndicator(isLoading);

    // Error Handling
    useEffect(() => {
        if (error) {
            setErrorMessage(error.message);
        }
    }, [error]);

    // 8. Intent Handling (CAD Flow Trigger)
    //    Moved from old Widget, preserving logic.
    const { historyLoaded } = { historyLoaded: !isRestoringHistory }; // Mapping concept

    useEffect(() => {
        const intent = searchParams?.get('intent');
        if (intent === 'cad' && historyLoaded && !isLoading && messages.length <= 2) {
            const timeoutId = setTimeout(async () => {
                try {
                    await sendMessage("Vorrei effettuare un rilievo CAD di questa stanza. Mi aiuti a estrarre le misure?");
                    // Cleanup URL
                    const params = new URLSearchParams(window.location.search);
                    params.delete('intent');
                    const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
                    window.history.replaceState({}, '', newUrl);
                } catch (err) {
                    console.error('Failed to trigger auto-msg', err);
                }
            }, 1000);
            return () => clearTimeout(timeoutId);
        }
    }, [searchParams, historyLoaded, isLoading, messages.length, sendMessage]);

    // 9. Event Listeners for External Triggers (Navbar, Hero, etc.)
    useEffect(() => {
        const handleOpenChat = () => setIsOpen(true);

        const handleOpenChatWithMessage = (e: Event) => {
            setIsOpen(true);
            const customEvent = e as CustomEvent;
            if (customEvent.detail?.message) {
                setInput(customEvent.detail.message);
            }
        };

        window.addEventListener('OPEN_CHAT', handleOpenChat);
        window.addEventListener('OPEN_CHAT_WITH_MESSAGE', handleOpenChatWithMessage);

        return () => {
            window.removeEventListener('OPEN_CHAT', handleOpenChat);
            window.removeEventListener('OPEN_CHAT_WITH_MESSAGE', handleOpenChatWithMessage);
        };
    }, [setInput]);

    // 9. Render Helpers
    if (typeof window !== 'undefined' && !sessionId) return null; // Safe guard

    // Best Practice: Avoid "Double Chat". 
    // If we are 'floating' and on the main Project Page (which has 'inline'), hide this instance.
    const isProjectPage = /^\/dashboard\/[^/]+$/.test(pathname || '');
    if (variant === 'floating' && isProjectPage) {
        return null;
    }

    function renderChatContent() {
        return (
            <>
                <div className="flex-1 overflow-hidden p-0 flex flex-col relative">
                    {isRestoringHistory && (
                        <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-luxury-gold"></div>
                        </div>
                    )}

                    <ChatMessages
                        messages={messages}
                        isLoading={isLoading}
                        typingMessage={typingMessage}
                        sessionId={sessionId}
                        onImageClick={setSelectedImage}
                        messagesContainerRef={messagesContainerRef}
                        messagesEndRef={messagesEndRef}
                        statusMessage={currentStatus}
                        data={data} // 🔥 Pass CoT Data Stream
                        onFormSubmit={handleFormSubmit}
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
                    inputValue={input}
                    setInputValue={setInput} // Context handler
                    onSubmit={submitMessage}
                    isLoading={isLoading}
                    uploads={uploads}
                    onFileSelect={handleFileSelect}
                    onRemoveUpload={removeFile}
                    onRetryUpload={retryUpload}
                    onScrollToBottom={() => scrollToBottom('smooth')}
                    fileInputRef={fileInputRef}
                    authLoading={false} // Managed by middleware/context
                />
            </>
        );
    }

    return (
        <>
            {/* Toggle Button - Hide if inline */}
            {!isInline && (
                <div className="fixed bottom-4 right-2 md:bottom-8 md:right-6 z-50 flex items-center gap-4">
                    <ChatToggleButton
                        isOpen={isOpen}
                        onClick={() => setIsOpen(!isOpen)}
                    />
                </div>
            )}

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
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
                                    "bg-luxury-bg/95 backdrop-blur-xl md:border border-luxury-gold/20 flex flex-col overflow-hidden z-10",
                                    "relative !w-full !max-w-none h-full rounded-3xl border border-luxury-gold/10 shadow-2xl"
                                )}
                            >
                                <ChatHeader
                                    projectId={contextProjectId ?? undefined}
                                    showSelector={!!user && !user.isAnonymous}
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
                                    height: isMobile
                                        ? keyboardHeight > 0
                                            ? `calc(100dvh - ${keyboardHeight}px)`
                                            : '100dvh'
                                        : undefined,
                                    bottom: isMobile ? 0 : undefined,
                                    position: 'fixed'
                                }}
                                className={cn(
                                    "bg-luxury-bg/95 backdrop-blur-xl md:border border-luxury-gold/20 flex flex-col overflow-hidden z-[100]",
                                    "fixed inset-x-0 md:inset-auto md:bottom-4 md:right-6 w-full md:w-[450px] md:h-[850px] md:max-h-[calc(100vh-40px)] md:rounded-3xl shadow-2xl"
                                )}
                            >
                                <ChatHeader
                                    onMinimize={() => setIsOpen(false)}
                                    projectId={contextProjectId ?? undefined}
                                    showSelector={!!user && !user.isAnonymous}
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
}