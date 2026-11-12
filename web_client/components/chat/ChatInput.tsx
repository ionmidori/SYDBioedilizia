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
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadItem } from '@/types/media';
import { FilePreviewItem } from '@/components/chat/FilePreviewItem';
import { UploadErrorNotice } from '@/components/chat/UploadErrorNotice';
import { triggerHaptic } from '@/lib/haptics';
import { validateFileForUpload } from "@/lib/validation/file-upload-schema";
import { validateVideo } from "@/lib/media-utils";
import { AttachmentMenu } from '@/components/chat/AttachmentMenu';
import { VideoTrimmer } from '@/components/chat/VideoTrimmer';
import { logger } from '@/lib/logger';

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
    const galleryPhotoRef = useRef<HTMLInputElement>(null); // Photo Library: image/* only, no capture
    const documentInputRef = useRef<HTMLInputElement>(null); // PDF only
    // Cloud (Google Drive / iCloud Drive): nessun capture → il picker di sistema mostra Drive/iCloud come sorgenti
    const cloudInputRef = useRef<HTMLInputElement>(null);
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

    const [videoToTrim, setVideoToTrim] = useState<File | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    // Handle file selection from input (max 5 files per selection to prevent browser overload)
    const MAX_FILES_PER_SELECTION = 3;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = Array.from(e.target.files);
            if (selected.length > MAX_FILES_PER_SELECTION) {
                alert(`Puoi selezionare al massimo ${MAX_FILES_PER_SELECTION} file alla volta.`);
            }
            const filesToUpload: File[] = [];
            let foundVideoToTrim: File | null = null;
            
            for (const file of selected.slice(0, MAX_FILES_PER_SELECTION)) {
                if (file.type.startsWith('video/')) {
                    const videoValidation = await validateVideo(file);
                    if (!videoValidation.valid) {
                        alert(videoValidation.error);
                        continue;
                    }
                    // Select the first valid video for trimming
                    if (!foundVideoToTrim) {
                        foundVideoToTrim = file;
                    } else {
                        filesToUpload.push(file);
                    }
                } else {
                    const validation = validateFileForUpload(file);
                    if (!validation.valid) {
                        alert(validation.error);
                        continue;
                    }
                    filesToUpload.push(file);
                }
            }

            if (foundVideoToTrim) {
                setVideoToTrim(foundVideoToTrim);
                setPendingFiles(filesToUpload);
            } else if (filesToUpload.length > 0) {
                onFileSelect(filesToUpload);
            }
            e.target.value = '';
        }
    };

    const handleTrimConfirm = (file: File, start: number, end: number) => {
        logger.debug(`[ChatInput] Video trimmed from ${start.toFixed(2)}s to ${end.toFixed(2)}s`);
        // We append the (pseudo) trimmed video to the rest of the files and upload
        onFileSelect([file, ...pendingFiles]);
        setVideoToTrim(null);
        setPendingFiles([]);
    };

    const handleTrimCancel = () => {
        // If the user aborts trimming, we don't upload the video, but we upload the other files.
        if (pendingFiles.length > 0) {
            onFileSelect(pendingFiles);
        }
        setVideoToTrim(null);
        setPendingFiles([]);
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
            className="px-4 bg-surface border-t border-line flex-shrink-0 w-full"
            style={{
                paddingTop: '10px',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)', // Explicit safe area + 24px
            }}
        >
            <div className="flex gap-2 items-end max-w-full">
                {/* Attachment Menu Trigger & Dropdown */}
                <div className="relative" ref={containerRef}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                            'text-ink-muted hover:text-primary-ink shrink-0 relative',
                            'hover:bg-primary-subtle transition-all w-11 h-11 sm:w-10 sm:h-10',
                            'focus-visible:ring-2 focus-visible:ring-ring rounded-full cursor-pointer',
                            'mb-1' // Align with Send button
                        )}
                        onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                        disabled={isLoading || isGlobalUploading || authLoading}
                        aria-label="Apri menu allegati"
                        aria-expanded={isAttachMenuOpen}
                        aria-haspopup="true"
                    >
                        {isGlobalUploading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-primary-ink" />
                        ) : (
                            <Paperclip className="w-5 h-5" />
                        )}
                    </Button>

                    <AttachmentMenu
                        isOpen={isAttachMenuOpen}
                        onClose={() => setIsAttachMenuOpen(false)}
                        onGalleryPhotoClick={() => {
                            setTimeout(() => galleryPhotoRef.current?.click(), 100);
                        }}
                        onCameraClick={() => {
                            setTimeout(() => cameraInputRef.current?.click(), 100);
                        }}
                        onVideoClick={() => {
                            setTimeout(() => videoInputRef.current?.click(), 100);
                        }}
                        onDocumentClick={() => {
                            setTimeout(() => documentInputRef.current?.click(), 100);
                        }}
                        onCloudClick={() => {
                            setTimeout(() => cloudInputRef.current?.click(), 100);
                        }}
                    />
                </div>

                {/*
                 * Hidden File Inputs — uno per tipo, con accept stretto per privacy e UX mobile.
                 *
                 * PERCHÉ INPUT SEPARATI:
                 * - accept="image/*,video/mp4,..." → Android/iOS apre dialog generico (Files, Drive, ...)
                 * - accept="image/*" senza capture → iOS apre Photo Library, Android apre galleria foto
                 * - capture="environment" → salta la galleria e apre la fotocamera direttamente
                 *
                 * PRIVACY:
                 * - Nessun input ha accesso a più tipi di dati del necessario
                 * - Il PDF input non può mai ricevere immagini/video (e viceversa)
                 * - Tutti sono aria-hidden + tabIndex=-1 (non navigabili da tastiera/screen reader)
                 * - e.target.value = '' in handleFileChange azzera subito il riferimento al file
                 */}

                {/* 1. Galleria Foto — image/* senza capture: iOS → Photo Library, Android → Galleria */}
                <input
                    type="file"
                    ref={galleryPhotoRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                    multiple
                    // aria-hidden + tabIndex=-1 means there is no accessible selector
                    // for this input; the E2E suite drives it via setInputFiles.
                    data-testid="chat-file-input"
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/* 2. Fotocamera — capture="environment": apre direttamente la camera posteriore */}
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

                {/* 3. Video — capture="environment" + video: apre la camera in modalità video */}
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

                {/* 4. Documento PDF — application/pdf: apre file manager, non la galleria */}
                <input
                    type="file"
                    ref={documentInputRef}
                    className="hidden"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/*
                 * 5. Google Drive / iCloud Drive — OTTIMIZZATO PER ACCESSO DIRETTO.
                 *
                 * PERCHÉ QUESTO CAMBIAMENTO:
                 * - Usando "image/*" o "video/*", iOS apre il menu "Libreria/Camera/File".
                 * - Usando tipi "application/*" o estensioni specifiche, iOS apre DIRETTAMENTE l'app File (Drive).
                 * - Dall'app File l'utente può comunque selezionare foto e video salvati nel cloud.
                 */}
                <input
                    type="file"
                    ref={cloudInputRef}
                    className="hidden"
                    accept="application/pdf,application/octet-stream,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,video/mp4"
                    onChange={handleFileChange}
                    multiple
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/* Fallback ref esterno (usato da ChatWidget per programmatic click se necessario) */}
                <input
                    type="file"
                    ref={fileInputRef as React.RefObject<HTMLInputElement>}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                    multiple
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
                    <UploadErrorNotice items={uploadItems} />

                    {/* Text Input Area */}
                    <div
                        className={cn(
                            'bg-surface-muted/60 focus-within:bg-surface border border-line focus-within:border-primary rounded-2xl',
                            'flex items-center p-1 transition-all duration-300',
                            'focus-within:ring-1 focus-within:ring-ring',
                            'min-h-[44px]', // Enforce min-height on wrapper
                            isFocused && 'ring-1 ring-ring bg-surface border-primary',
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
                                'w-full bg-transparent text-ink caret-primary-ink',
                                'placeholder:text-ink-muted px-3 py-2',
                                'text-base md:text-sm', // Mobile: 16px (no zoom), Desktop: 14px
                                'max-h-24 min-h-[24px] focus:outline-hidden resize-none', // Reduced min-h to let wrapper control height
                                'scrollbar-hide block opacity-100'
                            )}
                            rows={1}
                            disabled={isLoading || authLoading}
                        />
                    </div>
                </div>

                {/* Send Button */}
                <Button
                    type="button"
                    onClick={() => {
                        triggerHaptic();
                        onSubmit();
                    }}
                    disabled={isSendDisabled}
                    className={cn(
                        'rounded-xl transition-all duration-300 shrink-0 mb-1',
                        'w-11 h-11 sm:w-10 sm:h-10',
                        'focus-visible:ring-2 focus-visible:ring-ring',
                        !isSendDisabled
                            ? 'bg-primary hover:bg-primary-hover text-on-primary shadow-md cursor-pointer'
                            : 'bg-surface-muted text-ink-subtle'
                    )}
                    size="icon"
                    aria-label="Invia messaggio"
                >
                    <Send className="w-5 h-5" />
                </Button>
            </div>

            {/* Disclaimer GDPR / AI Act — trasparenza sull'uso di IA e rinvio all'informativa privacy */}
            <p className="mt-2 text-center text-[11px] leading-snug text-ink-subtle">
                SYD è un&apos;intelligenza artificiale e può commettere errori. I tuoi dati sono
                trattati secondo la nostra{' '}
                <Link
                    href="/privacy"
                    className="underline hover:text-primary-ink transition-colors"
                >
                    Informativa sulla Privacy
                </Link>
                .
            </p>

            <VideoTrimmer
                file={videoToTrim}
                isOpen={!!videoToTrim}
                onConfirm={handleTrimConfirm}
                onCancel={handleTrimCancel}
            />
        </div>
    );
}
