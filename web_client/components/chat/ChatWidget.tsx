"use client";

// Components
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { RoomChips } from '@/components/chat/RoomChips';
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
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { useStatusQueue } from '@/hooks/useStatusQueue';
import { useStreamNotice } from '@/hooks/useStreamNotice';
import { ChatAlert } from '@/components/chat/ChatAlert';
import { logger } from '@/lib/logger';
import { warmBackend } from '@/lib/backend-warmup';
import { mapErrorToMessage } from '@/lib/chat/error-messages';
import { buildMediaPayload } from '@/lib/chat/message-media';
import { useOpenChatEvents } from '@/hooks/useOpenChatEvents';
import { setChatWindowOpen } from '@/lib/chat/chat-window-state';

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
 * - Always shows the chat of the provider: the user's one chat, or the guest's
 *   (Phase 139); there is no chat to pick.
 */
interface ChatWidgetProps {
    variant?: 'floating' | 'inline';
}

export default function ChatWidget({ variant = 'floating' }: ChatWidgetProps) {
    return (
        <ChatErrorBoundary>
            <ChatWidgetContent variant={variant} />
        </ChatErrorBoundary>
    );
}

function ChatWidgetContent({ variant = 'floating' }: ChatWidgetProps) {
    const isInline = variant === 'inline';

    // 1. Consume Global Context
    const {
        sessionId,
        userChatId,
        messages,
        input,
        setInput,
        sendMessage,
        isLoading,
        error,
        reload,
        data,
        isRestoringHistory,
        historyMessages,
        rooms,
        activeRoomId,
        setActiveRoomId,
        chatNotice,
        dismissChatNotice,
    } = useChatContext();

    // 2. State & Refs
    const [isOpen, setIsOpen] = useState(isInline);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isRetryableError, setIsRetryableError] = useState(false);

    const dragControls = useDragControls();

    // Uploads and feedback use the chat's own sessionId (from the provider). A
    // locally derived id ("global-guest" for every guest) put guest files under
    // a shared prefix and made the backend drop attached videos as foreign.
    const { isInitialized } = useAuth();

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Opening the chat is the strongest signal a message is coming: start a
    // backend instance now so the first reply does not pay the cold start.
    useEffect(() => {
        if (isOpen) warmBackend();
    }, [isOpen]);

    // A login that leaves the page (redirect, magic link) reads this to bring
    // the user back with the chat as it was. The inline chat is always open.
    useEffect(() => {
        if (isInline) return;
        setChatWindowOpen(isOpen);
        return () => setChatWindowOpen(false);
    }, [isInline, isOpen]);

    // 4. Status Queue (Visuals)
    const { currentStatus, addStatus, clearQueue } = useStatusQueue();

    // Watch 'data' from context for status updates
    useEffect(() => {
        if (!data || data.length === 0) return;

        const latest = data[data.length - 1];
        // Protocol: 2:[{"type": "status", "message": "..."}]
        if (latest && typeof latest === 'object') {
            const typedLatest = latest as { type?: string; message?: string; data?: unknown };
            if (typedLatest.type === 'status' && typedLatest.message) {
                addStatus(typedLatest.message);
            }
        }
    }, [data, addStatus]);

    // Notices about the turn that are not errors (e.g. an attached video that
    // could not be read): the reply still arrives.
    const { notice, dismiss: dismissNotice } = useStreamNotice(data ?? []);

    // Clear queue, error and notice when the chat changes (login, logout, a
    // chat merged into the user's)
    useEffect(() => {
        clearQueue();
        const timerId = setTimeout(() => {
            setErrorMessage(null);
            setIsRetryableError(false);
            dismissNotice();
        }, 0);
        return () => clearTimeout(timerId);
    }, [sessionId, clearQueue, dismissNotice]);

    // 5. Unified Upload Hook
    const { uploads, addFiles, removeFile, retryUpload, clearAll, isUploading, successfulUploads } = useUpload({ sessionId: sessionId ?? undefined, roomId: activeRoomId });

    // 6. Scroll & Viewport
    // We filter messages to show welcome message vs real messages
    // The Provider already handles initial welcome messages in `messages`.
    const { messagesContainerRef, messagesEndRef, scrollToBottom } = useChatScroll(messages, isOpen);
    // 🔥 FIX: Enable keyboard tracking for both floating and inline variants
    const { isMobile, keyboardHeight } = useMobileViewport(isOpen, chatContainerRef, isInline);

    // 7. Handlers

    const handleFileSelect = useCallback((files: File[]) => {
        if (files.length > 0) addFiles(files);
    }, [addFiles]);

    // Submit Handler
    const submitMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (isUploading || !isInitialized || !sessionId) return;
        if (!input.trim() && Object.keys(uploads).length === 0) return;

        // Prepare Media
        const completedUploads = successfulUploads;

        logger.debug('[ChatWidget] Submit: completedUploads:', completedUploads.map(u => ({
            id: u.id,
            status: u.status,
            assetType: u.serverData?.asset_type,
            url: u.serverData?.url?.substring(0, 60),
        })));

        const dataBody = buildMediaPayload(completedUploads, activeRoomId);

        // UI Optimistic Clear (a notice belongs to the previous turn)
        clearAll();
        dismissNotice();
        // input cleared by sendMessage typically, but we can do it here if we want optimistic clear
        // setInput('') is called by sendMessage in provider on success. 
        // We can trust provider or force it.

        // Scroll
        if (isOpen) scrollToBottom();

        try {
            await sendMessage(input, dataBody.mediaUrls, dataBody);
        } catch (err: unknown) {
            const error = err as Error;
            setErrorMessage(error.message || "Invio fallito.");
        }
    };

    // Typing Indicator
    const typingMessage = useTypingIndicator(isLoading);

    // Error Handling — map backend error codes to user-friendly Italian messages
    useEffect(() => {
        if (error) {
            const timerId = setTimeout(() => {
                const { message, retryable } = mapErrorToMessage(error.message);
                setErrorMessage(message);
                setIsRetryableError(retryable);
            }, 0);
            return () => clearTimeout(timerId);
        }
    }, [error]);

    // 8. Event Listeners for External Triggers (Navbar, Hero, etc.)
    useOpenChatEvents({ setIsOpen, setInput, reopenAfterLogin: !isInline });

    // Drag-to-close handler
    const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const swipeThreshold = 100; // pixels to swipe before closing
        const velocityThreshold = 500; // pixels per second

        if (info.offset.y > swipeThreshold || info.velocity.y > velocityThreshold) {
            setIsOpen(false);
        }
    };

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
                        historyMessages={historyMessages}
                        isLoading={isLoading}
                        typingMessage={typingMessage}
                        sessionId={sessionId}
                        onImageClick={setSelectedImage}
                        messagesContainerRef={messagesContainerRef}
                        messagesEndRef={messagesEndRef}
                        statusMessage={currentStatus}
                        data={data} // 🔥 Pass CoT Data Stream
                    />

                    {notice && (
                        <ChatAlert
                            variant="warning"
                            message={notice.message}
                            onDismiss={dismissNotice}
                            dismissLabel="Chiudi avviso"
                        />
                    )}

                    {chatNotice && (
                        <ChatAlert
                            variant="warning"
                            message={chatNotice}
                            onDismiss={dismissChatNotice}
                            dismissLabel="Chiudi avviso"
                        />
                    )}

                    {errorMessage && (
                        <ChatAlert
                            variant="error"
                            message={errorMessage}
                            onDismiss={() => { setErrorMessage(null); setIsRetryableError(false); }}
                            dismissLabel="Chiudi errore"
                            action={isRetryableError ? {
                                label: 'Riprova',
                                ariaLabel: 'Riprova ultimo messaggio',
                                onClick: () => { setErrorMessage(null); setIsRetryableError(false); reload(); },
                            } : undefined}
                        />
                    )}
                </div>

                {userChatId && rooms.length > 0 && (
                    <RoomChips
                        projectId={userChatId}
                        rooms={rooms}
                        activeRoomId={activeRoomId}
                        onSelect={setActiveRoomId}
                    />
                )}

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
                    // Disabled until the chat id is known (the user's chat is being asked for)
                    authLoading={!sessionId}
                />
            </>
        );
    }

    return (
        <>
            {/* Toggle Button - Hide if inline */}
            {!isInline && (
                <ChatToggleButton
                    isOpen={isOpen}
                    onClick={() => setIsOpen(!isOpen)}
                />
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
                                className="fixed inset-0 z-[90] bg-[#0f172a]/80 backdrop-blur-md touch-none md:bg-transparent md:backdrop-blur-none"
                                onClick={() => setIsOpen(false)}
                            />
                        )}

                        {/* Window */}
                        {isInline ? (
                            <div
                                ref={chatContainerRef}
                                data-testid="chat-window"
                                style={{
                                    // Push content up when keyboard is open (respecting M3 easing)
                                    paddingBottom: isMobile && keyboardHeight > 0 ? `${keyboardHeight}px` : undefined,
                                    transition: 'padding-bottom 0.3s cubic-bezier(0.05, 0.7, 0.1, 1.0)'
                                }}
                                className={cn(
                                    "bg-luxury-bg/95 backdrop-blur-xl md:border border-luxury-gold/20 flex flex-col overflow-hidden z-10",
                                    "relative !w-full !max-w-none h-full rounded-3xl border border-luxury-gold/10 shadow-2xl"
                                )}
                            >
                                <ChatHeader />
                                {renderChatContent()}
                            </div>
                        ) : (
                            <motion.div
                                key="chat-window"
                                data-testid="chat-window"
                                drag="y"
                                dragControls={dragControls}
                                dragListener={false} // Only drag via controls attached to header
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={0.4}
                                onDragEnd={handleDragEnd}
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
                                    onPointerDown={(e) => dragControls.start(e)}
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