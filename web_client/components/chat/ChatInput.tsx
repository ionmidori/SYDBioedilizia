"use client";

/**
 * ChatInput Component (Refactored)
 *
 * Unified input component with:
 * - File previews using `FilePreviewItem`
 * - Single file input accepting images and videos
 * - Keyboard handling for Enter to send
 * - Mobile-optimized focus handling
 *
 * @see hooks/useUpload.ts - Source of upload state
 */
import React, { RefObject, useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadItem } from '@/types/media';
import { FilePreviewItem } from '@/components/chat/FilePreviewItem';
import { triggerHaptic } from '@/lib/haptics';
import { validateFileForUpload } from "@/lib/validation/file-upload-schema";
import { validateVideo } from "@/lib/media-utils";
import { AttachmentMenu } from '@/components/chat/AttachmentMenu';

interface ChatInputProps {
    /** Current text input value */
    inputValue: string;
    /** Callback to update input value */
    setInputValue: (value: string) => void;
    /** Callback to submit the message */
    onSubmit: (e?: React.FormEvent) => void;
    /** Is the AI currently generating a response */
    isLoading: boolean;
    /** Upload state from useUpload hook */
    uploads: Record<string, UploadItem>;
    /** Callback when files are selected */
    onFileSelect: (files: File[]) => void;
    /** Callback to remove/cancel an upload */
    onRemoveUpload: (id: string) => void;
    /** Callback to retry a failed upload */
    onRetryUpload?: (id: string) => void;
    /** Callback to scroll chat to bottom */
    onScrollToBottom: () => void;
    /** Ref to the hidden file input */
    fileInputRef: RefObject<HTMLInputElement | null>;
    /** Is auth in progress */
    authLoading?: boolean;
}

/**
 * Chat input component with textarea, file upload, and send button.
 */
export function ChatInput({
    inputValue,
    setInputValue,
    onSubmit,
    isLoading,
    uploads,
    onFileSelect,
    onRemoveUpload,
    onRetryUpload,
    onScrollToBottom,
    fileInputRef,
    authLoading = false,
}: ChatInputProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Derived state
    const uploadItems = useMemo(() => Object.values(uploads), [uploads]);
    const hasActiveUploads = useMemo(
        () => uploadItems.some((i) => i.status === 'uploading' || i.status === 'compressing'),
        [uploadItems]
    );
    const isGlobalUploading = hasActiveUploads;
    const isSendDisabled =
        isLoading ||
        authLoading ||
        (!inputValue.trim() && uploadItems.length === 0) ||
        hasActiveUploads;

    // Handle click outside to close attachment menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsAttachMenuOpen(false);
            }
        };

        if (isAttachMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAttachMenuOpen]);

    // Handle file selection from input (max 5 files per selection to prevent browser overload)
    const MAX_FILES_PER_SELECTION = 3;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = Array.from(e.target.files);
            if (selected.length > MAX_FILES_PER_SELECTION) {
                alert(`Puoi selezionare al massimo ${MAX_FILES_PER_SELECTION} file alla volta.`);
            }
            const filesToUpload: File[] = [];
            for (const file of selected.slice(0, MAX_FILES_PER_SELECTION)) {
                if (file.type.startsWith('video/')) {
                    const videoValidation = await validateVideo(file);
                    if (!videoValidation.valid) {
                        alert(videoValidation.error);
                        continue;
                    }
                }

                const validation = validateFileForUpload(file);
                if (!validation.valid) {
                    alert(validation.error);
                    continue;
                }
                filesToUpload.push(file);
            }

            if (filesToUpload.length > 0) {
                onFileSelect(filesToUpload);
            }
            e.target.value = '';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isSendDisabled) onSubmit(e);
        }
    };

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(true);
        const target = e.target;

        // Use visualViewport API to scroll once the keyboard is fully open,
        // instead of an arbitrary 300ms delay that races with keyboard animation.
        const vv = window.visualViewport;
        if (vv) {
            const onViewportResize = () => {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                onScrollToBottom();
                vv.removeEventListener('resize', onViewportResize);
            };
            vv.addEventListener('resize', onViewportResize, { once: true });
            // Fallback: if visualViewport doesn't fire (desktop or no keyboard)
            setTimeout(() => {
                vv.removeEventListener('resize', onViewportResize);
                onScrollToBottom();
            }, 500);
        } else {
            // No visualViewport support — fallback
            setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                onScrollToBottom();
            }, 300);
        }
    };

    return (
        <div
            className="px-4 border-t border-luxury-gold/10 backdrop-blur-md flex-shrink-0 w-full"
            style={{
                backgroundColor: 'rgb(var(--luxury-bg-rgb) / 0.95)',
                paddingTop: '10px',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)', // Explicit safe area + 24px
            }}
        >
            <div className="flex gap-2 items-end max-w-full">
                {/* Attachment Menu Trigger & Dropdown */}
                <div className="relative" ref={containerRef}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            'text-luxury-text/60 hover:text-luxury-gold shrink-0 relative',
                            'hover:bg-luxury-gold/5 transition-all w-10 h-10 sm:w-9 sm:h-9',
                            'focus-visible:ring-2 focus-visible:ring-luxury-gold/50 rounded-full',
                            'mb-1' // Align with Send button
                        )}
                        onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                        disabled={isLoading || isGlobalUploading || authLoading}
                        aria-label="Apri menu allegati"
                        aria-expanded={isAttachMenuOpen}
                        aria-haspopup="true"
                        asChild
                    >
                        <motion.button whileTap={{ scale: 0.9 }}>
                            {isGlobalUploading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-luxury-teal" />
                            ) : (
                                <Paperclip className="w-5 h-5" />
                            )}
                        </motion.button>
                    </Button>

                    <AttachmentMenu
                        isOpen={isAttachMenuOpen}
                        onClose={() => setIsAttachMenuOpen(false)}
                        onCameraClick={() => {
                            setTimeout(() => cameraInputRef.current?.click(), 100);
                        }}
                        onVideoClick={() => {
                            setTimeout(() => videoInputRef.current?.click(), 100);
                        }}
                        onGalleryClick={() => {
                            setTimeout(() => fileInputRef.current?.click(), 100);
                        }}
                    />
                </div>

                {/* Hidden File Input - Galleria/Documenti (no capture → mostra galleria + file system) */}
                <input
                    type="file"
                    ref={fileInputRef as React.RefObject<HTMLInputElement>}
                    className="hidden"
                    accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,application/pdf"
                    onChange={handleFileChange}
                    multiple
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/* Hidden Camera Input - Scatta Foto (capture="environment" → apre fotocamera direttamente) */}
                <input
                    type="file"
                    ref={cameraInputRef}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/* Hidden Video Input - Registra Video (capture="environment" + accept video → registra video) */}
                <input
                    type="file"
                    ref={videoInputRef}
                    className="hidden"
                    accept="video/mp4,video/quicktime,video/x-msvideo"
                    capture="environment"
                    onChange={handleFileChange}
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                    {/* File Previews */}
                    {uploadItems.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-1" role="list" aria-label="File allegati">
                            <AnimatePresence mode="popLayout">
                                {uploadItems.map((item) => (
                                    <FilePreviewItem
                                        key={item.id}
                                        item={item}
                                        onRemove={onRemoveUpload}
                                        onRetry={onRetryUpload}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Text Input Area */}
                    <div
                        className={cn(
                            'bg-luxury-bg/30 border border-luxury-gold/10 rounded-2xl',
                            'flex items-center p-1 transition-all duration-300',
                            'focus-within:ring-1 focus-within:ring-luxury-gold/30',
                            'min-h-[44px]', // Enforce min-height on wrapper
                            isFocused && 'ring-1 ring-luxury-gold/30',
                            'mb-1' // Align with buttons
                        )}
                    >
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={handleFocus}
                            onBlur={() => setIsFocused(false)}
                            placeholder={
                                authLoading ? 'Connessione in corso...' : 'Descrivi cosa vuoi ristrutturare...'
                            }
                            aria-label="Messaggio chat"
                            className={cn(
                                'w-full bg-transparent text-luxury-text caret-luxury-gold',
                                'placeholder:text-luxury-text/30 px-3 py-2',
                                'text-base md:text-sm', // Mobile: 16px (no zoom), Desktop: 14px
                                'max-h-24 min-h-[24px] focus:outline-none resize-none', // Reduced min-h to let wrapper control height
                                'scrollbar-hide block opacity-100'
                            )}
                            rows={1}
                            disabled={isLoading || authLoading}
                        />
                    </div>
                </div>

                {/* Send Button */}
                <Button
                    onClick={() => {
                        triggerHaptic();
                        onSubmit();
                    }}
                    disabled={isSendDisabled}
                    className={cn(
                        'rounded-xl transition-all duration-300 shrink-0 mb-1',
                        'w-10 h-10 sm:w-9 sm:h-9',
                        'focus-visible:ring-2 focus-visible:ring-luxury-gold/50',
                        !isSendDisabled
                            ? 'bg-luxury-teal hover:bg-luxury-teal/90 text-white shadow-lg shadow-luxury-teal/20'
                            : 'bg-luxury-gold/10 text-luxury-text/20'
                    )}
                    size="icon"
                    aria-label="Invia messaggio"
                    asChild
                >
                    <motion.button whileTap={{ scale: isSendDisabled ? 1 : 0.9 }}>
                        <Send className="w-5 h-5" />
                    </motion.button>
                </Button>
            </div>
        </div>
    );
}
