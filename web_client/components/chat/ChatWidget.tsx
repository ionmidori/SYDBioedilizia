'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Hooks
import { useSessionId } from '@/hooks/useSessionId';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChat } from '@/hooks/useChat';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

// Components
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatToggleButton } from '@/components/chat/ChatToggleButton';
import { WelcomeBadge } from '@/components/chat/WelcomeBadge';
import { ImageLightbox } from '@/components/chat/ImageLightbox';

/**
 * ChatWidget Component (Refactored)
 * 
 * ARCHITECTURE: Orchestrator pattern
 * - Uses custom hooks for business logic
 * - Composes UI components for presentation
 * - Reduced from 604 lines to ~150 lines
 * 
 * Previous implementation used manual fetch with TextDecoder for streaming.
 * This refactor maintains the same functionality with improved modularity.
 */
export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Refs
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Session Management
    const sessionId = useSessionId();

    // Load conversation history
    const { historyLoaded, historyMessages } = useChatHistory(sessionId);

    // Chat State & Streaming
    // ✅ CRITICAL: Memoize welcome message to prevent re-render loop
    const welcomeMessage = React.useMemo(() => ({
        id: 'welcome',
        role: 'assistant',
        content: "Ciao! Sono **SYD**, il tuo Architetto personale. 🏗️\n\nPosso aiutarti a:\n1. 📐 **Creare un Preventivo** dettagliato.\n2. 🎨 **Visualizzare un Rendering** 3D (partendo da una tua foto o da una descrizione).\n\n💡 **Tip:** Per risultati migliori, scatta le foto in modalità **0.5x (grandangolo)**.\n\nDa dove iniziamo?"
    }), []);

    // ✅ CRITICAL: Stabilize initialMessages array reference
    // Only pass real history to SDK to prevent auto-generation
    const initialChatMessages = React.useMemo(() => {
        // If we have history, use it. Otherwise, pass empty array to SDK
        // (welcome message will be added only for UI display)
        return historyMessages.length > 0 ? historyMessages : [];
    }, [historyMessages]);

    // ✅ Initialize SDK hook with stable reference
    const chatResponse = useChat(sessionId, initialChatMessages);
    const { messages, isLoading, append, error } = chatResponse;

    // ✅ Add welcome message ONLY for UI display, if no history exists
    // Memoize to prevent infinite re-render loop
    const displayMessages = React.useMemo(() => {
        if (historyMessages.length > 0) {
            return messages;
        }
        // Only add welcome if we have no history AND no messages from SDK yet
        return messages.length === 0 ? [welcomeMessage] : messages;
    }, [historyMessages.length, messages, welcomeMessage]);

    // Image Upload (now with persistent Storage URLs)
    // Image Upload (now with persistent Storage URLs)
    const { selectedImages, imageUrls, handleFileSelect, clearImages, isUploading, uploadStatus, removeImage } = useImageUpload(sessionId);

    // Scroll Management
    const { messagesContainerRef, messagesEndRef, scrollToBottom } = useChatScroll(displayMessages.length, isOpen);

    // Mobile Viewport & Body Lock
    const { isMobile } = useMobileViewport(isOpen, chatContainerRef);

    // Typing Indicator
    const typingMessage = useTypingIndicator(isLoading);

    // Input State
    const [inputValue, setInputValue] = useState('');

    // Submit Message Handler
    const submitMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

        if (selectedImages.length > 0) {
            append({
                role: 'user',
                content: inputValue,
                // ✅ NEW: Include attachments for immediate preview in chat
                attachments: {
                    images: imageUrls.length > 0 ? imageUrls : selectedImages // Prefer public URLs, fallback to base64
                }
            } as any, {
                body: {
                    images: selectedImages,      // base64 for AI vision
                    imageUrls: imageUrls          // Public URLs for modification mode
                }
            });
            clearImages();
            setInputValue('');
        } else {
            append({
                role: 'user',
                content: inputValue
            });
            setInputValue('');
        }
    };


    // External Triggers (for opening chat from other components)
    useEffect(() => {
        const handleOpenChat = (e: CustomEvent<{ message?: string }>) => {
            setIsOpen(true);
            if (e.detail?.message) {
                setTimeout(() => {
                    append({ role: 'user', content: e.detail.message! });
                }, 500);
            }
        };
        window.addEventListener('OPEN_CHAT_WITH_MESSAGE' as any, handleOpenChat as any);
        return () => window.removeEventListener('OPEN_CHAT_WITH_MESSAGE' as any, handleOpenChat as any);
    }, [append]);

    // 🛑 CRITICAL: Loading Guard - Moved here to follow Rules of Hooks
    // We only return null for the UI, but hooks above must always run
    if (!historyLoaded) {
        return null;
    }

    return (
        <>
            {/* Floating Toggle Button Area */}
            <div className="fixed bottom-8 right-6 z-50 flex items-center gap-4">
                <WelcomeBadge isOpen={isOpen} onOpenChat={() => setIsOpen(true)} />
                <ChatToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
            </div>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[90] bg-[#0f172a] touch-none md:bg-black/40 md:backdrop-blur-sm transition-all duration-300"
                        />

                        {/* Chat Container */}
                        <motion.div
                            key="chat-window"
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 50, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            ref={chatContainerRef}
                            style={{ height: isMobile ? '100dvh' : undefined, top: isMobile ? 0 : undefined }}
                            className="fixed inset-0 md:inset-auto md:bottom-4 md:right-6 w-full md:w-[450px] md:h-[850px] md:max-h-[calc(100vh-40px)] bg-[#0f172a]/95 backdrop-blur-xl border-none md:border border-slate-700/50 rounded-none md:rounded-3xl shadow-none md:shadow-2xl flex flex-col overflow-hidden overscroll-none touch-none z-[100] origin-bottom-right"
                        >
                            <ChatHeader onMinimize={() => setIsOpen(false)} />

                            <ChatMessages
                                messages={displayMessages as any[]}
                                isLoading={isLoading}
                                typingMessage={typingMessage}
                                onImageClick={setSelectedImage}
                                messagesContainerRef={messagesContainerRef}
                                messagesEndRef={messagesEndRef}
                            />

                            <ChatInput
                                inputValue={inputValue}
                                setInputValue={setInputValue}
                                onSubmit={submitMessage}
                                isLoading={isLoading}
                                isUploading={isUploading}
                                uploadStatus={uploadStatus}
                                selectedImages={selectedImages}
                                onFileSelect={handleFileSelect}
                                onScrollToBottom={() => scrollToBottom('smooth')}
                                fileInputRef={fileInputRef}
                                removeImage={removeImage}
                            />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Image Lightbox */}
            <ImageLightbox imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
        </>
    );
}
