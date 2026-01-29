"use client";

import React, { RefObject, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2, FileVideo, X, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaUploadState } from '@/hooks/useMediaUpload';
import { VideoTrimmer } from '@/components/chat/VideoTrimmer';
import { triggerHaptic } from '@/lib/haptics';

interface ChatInputProps {
    inputValue: string;
    setInputValue: (value: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    isLoading: boolean;
    isGlobalUploading: boolean;
    mediaItems: MediaUploadState[];
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onScrollToBottom: () => void;
    fileInputRef: RefObject<HTMLInputElement>;
    removeMedia: (id: string) => void;
    updateMediaItem: (id: string, partial: Partial<MediaUploadState>) => void;
    authLoading?: boolean;
}

/**
 * Chat input component with textarea, file upload, and send button
 * Now supports Video Trimming
 */
export function ChatInput({
    inputValue,
    setInputValue,
    onSubmit,
    isLoading,
    isGlobalUploading,
    mediaItems,
    onFileSelect,
    onScrollToBottom,
    fileInputRef,
    removeMedia,
    updateMediaItem,
    authLoading = false
}: ChatInputProps) {
    const [trimmingItem, setTrimmingItem] = useState<MediaUploadState | null>(null);
    const [isFocused, setIsFocused] = useState(false); // Track focus for cinematic effect

    // Check if any item is still uploading
    const hasActiveUploads = mediaItems.some(i => i.status === 'uploading' || i.status === 'compressing');
    const isSendDisabled = isLoading || authLoading || (!inputValue.trim() && mediaItems.length === 0) || hasActiveUploads;

    return (
        <div
            className="px-4 border-t border-luxury-gold/10 backdrop-blur-md flex-shrink-0 w-full"
            style={{ backgroundColor: 'rgb(var(--luxury-bg-rgb) / 0.95)', paddingTop: '10px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
        >
            {/* ... Trimmer Overlay ... */}
            {trimmingItem && (
                <VideoTrimmer
                    file={trimmingItem.file}
                    initialStart={trimmingItem.trimRange?.start}
                    initialEnd={trimmingItem.trimRange?.end}
                    onClose={() => setTrimmingItem(null)}
                    onSave={(start, end) => {
                        updateMediaItem(trimmingItem.id, { trimRange: { start, end } });
                        setTrimmingItem(null);
                    }}
                />
            )}

            <div className="flex gap-2 items-end max-w-full">
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-luxury-text/60 hover:text-luxury-gold shrink-0 relative hover:bg-luxury-gold/5 transition-all w-10 h-10 sm:w-9 sm:h-9 focus-visible:ring-2 focus-visible:ring-luxury-gold/50 rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isGlobalUploading || authLoading}
                    aria-label="Allega file o immagine"
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

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v"
                    onChange={onFileSelect}
                    multiple
                    aria-hidden="true"
                    tabIndex={-1}
                />

                {/* Media Previews with Progress */}
                {mediaItems.length > 0 && (
                    <div className="flex-1 flex flex-col gap-2 min-w-0" role="list" aria-label="File allegati">
                        <div className="flex flex-wrap gap-2 mb-1">
                            {mediaItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="relative group w-20 h-20 rounded-lg overflow-hidden border border-luxury-gold/20 bg-luxury-bg/50 shadow-lg"
                                    role="listitem"
                                >
                                    {/* Preview Content */}
                                    {item.type === 'image' ? (
                                        <div className="relative w-full h-full">
                                            <Image
                                                src={item.previewUrl}
                                                alt="Anteprima immagine"
                                                fill
                                                className="object-cover opacity-80"
                                                sizes="80px"
                                                unoptimized
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-luxury-bg">
                                            <FileVideo className="w-8 h-8 text-luxury-teal" />
                                        </div>
                                    )}

                                    {/* Trim Badge/Button for Video */}
                                    {item.type === 'video' && item.status === 'done' && (
                                        <button
                                            className={cn(
                                                "absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10",
                                                item.trimRange ? "bg-green-600 hover:bg-green-500" : "bg-luxury-teal hover:bg-luxury-teal/80"
                                            )}
                                            onClick={() => setTrimmingItem(item)}
                                            title="Taglia Video"
                                            aria-label={`Taglia video ${item.file.name}`}
                                        >
                                            <Scissors className="w-3 h-3 text-white" />
                                        </button>
                                    )}

                                    {/* Progress Overlay */}
                                    {item.status !== 'done' && item.status !== 'idle' && (
                                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 p-1" role="progressbar" aria-valuenow={item.progress}>
                                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                                            {item.progress > 0 && (
                                                <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-luxury-teal transition-all duration-300"
                                                        style={{ width: `${item.progress}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Error Overlay */}
                                    {item.status === 'error' && (
                                        <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center">
                                            <span className="text-xs text-white font-bold">Error</span>
                                        </div>
                                    )}

                                    {/* Remove Button */}
                                    <button
                                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white"
                                        onClick={() => removeMedia(item.id)}
                                        disabled={item.status === 'uploading'}
                                        aria-label={`Rimuovi allegato ${item.type}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Text Input Area - Cinematic Focus Wrapper */}
                        <div
                            className={cn(
                                "bg-luxury-bg/30 border border-luxury-gold/10 rounded-2xl flex items-center p-1 transition-all duration-300 cinematic-focus focus-within:ring-1 focus-within:ring-luxury-gold/30",
                                isFocused ? "ring-1 ring-luxury-gold/30" : ""
                            )}
                        >
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!isSendDisabled) onSubmit(e);
                                    }
                                }}
                                onFocus={(e) => {
                                    setIsFocused(true);
                                    // 4. KEYBOARD AWARENESS: Smooth scroll with delay for keyboard animation
                                    setTimeout(() => {
                                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        onScrollToBottom();
                                    }, 300);
                                }}
                                onBlur={() => setIsFocused(false)}
                                placeholder={authLoading ? "Connessione in corso..." : "Descrivi cosa vuoi ristrutturare..."}
                                aria-label="Messaggio chat"
                                className="w-full bg-transparent text-luxury-text caret-luxury-gold placeholder:text-luxury-text/30 text-[16px] px-3 py-2 max-h-24 min-h-[44px] focus:outline-none resize-none scrollbar-hide block opacity-100"
                                rows={1}
                                disabled={isLoading || authLoading}
                            />
                        </div>
                    </div>
                )}

                {/* Standard Text Input ONLY if no media (fallback layout) */}
                {mediaItems.length === 0 && (
                    <div className="flex-1 bg-luxury-bg/30 border border-luxury-gold/10 rounded-2xl flex items-center p-1 focus-within:border-luxury-gold/50 transition-colors min-w-0 focus-within:ring-1 focus-within:ring-luxury-gold/30">
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onSubmit(e);
                                }
                            }}
                            onFocus={() => setTimeout(() => onScrollToBottom(), 100)}
                            placeholder={authLoading ? "Connessione in corso..." : "Descrivi cosa vuoi ristrutturare..."}
                            aria-label="Messaggio chat"
                            className="w-full bg-transparent text-luxury-text caret-luxury-gold placeholder:text-luxury-text/30 text-[16px] px-3 py-2 max-h-24 min-h-[44px] focus:outline-none resize-none scrollbar-hide block opacity-100"
                            rows={1}
                            disabled={isLoading || authLoading}
                        />
                    </div>
                )}

                <Button
                    onClick={() => {
                        triggerHaptic();
                        onSubmit();
                    }}
                    disabled={isSendDisabled}
                    className={cn(
                        "rounded-xl transition-all duration-300 shrink-0 mb-1 w-10 h-10 sm:w-9 sm:h-9 focus-visible:ring-2 focus-visible:ring-luxury-gold/50",
                        !isSendDisabled
                            ? "bg-luxury-teal hover:bg-luxury-teal/90 text-white shadow-lg shadow-luxury-teal/20"
                            : "bg-luxury-gold/10 text-luxury-text/20"
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
