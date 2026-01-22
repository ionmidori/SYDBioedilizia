import React, { RefObject, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2, FileVideo, X, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaUploadState } from '@/hooks/useMediaUpload';
import { VideoTrimmer } from '@/components/chat/VideoTrimmer';

interface ChatInputProps {
    inputValue: string;
    setInputValue: (value: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    isLoading: boolean;
    isGlobalUploading: boolean;
    mediaItems: MediaUploadState[];
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onScrollToBottom: () => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
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

    // Check if any item is still uploading
    const hasActiveUploads = mediaItems.some(i => i.status === 'uploading' || i.status === 'compressing');
    const isSendDisabled = isLoading || authLoading || (!inputValue.trim() && mediaItems.length === 0) || hasActiveUploads;

    return (
        <div
            className="px-4 border-t border-white/10 backdrop-blur-md flex-shrink-0 w-full"
            style={{ backgroundColor: '#0b1120', paddingTop: '10px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
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
                    className="text-slate-400 hover:text-white shrink-0 relative"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isGlobalUploading || authLoading}
                >
                    {isGlobalUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    ) : (
                        <Paperclip className="w-5 h-5" />
                    )}
                </Button>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v"
                    onChange={onFileSelect}
                    multiple
                />

                {/* Media Previews with Progress */}
                {mediaItems.length > 0 && (
                    <div className="flex-1 flex flex-col gap-2 min-w-0">
                        <div className="flex flex-wrap gap-2 mb-1">
                            {mediaItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shadow-lg"
                                >
                                    {/* Preview Content */}
                                    {item.type === 'image' ? (
                                        <img
                                            src={item.previewUrl}
                                            alt="preview"
                                            className="w-full h-full object-cover opacity-80"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                            <FileVideo className="w-8 h-8 text-blue-400" />
                                        </div>
                                    )}

                                    {/* Trim Badge/Button for Video */}
                                    {item.type === 'video' && item.status === 'done' && (
                                        <button
                                            className={cn(
                                                "absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10",
                                                item.trimRange ? "bg-green-600 hover:bg-green-500" : "bg-blue-600 hover:bg-blue-500"
                                            )}
                                            onClick={() => setTrimmingItem(item)}
                                            title="Taglia Video"
                                        >
                                            <Scissors className="w-3 h-3 text-white" />
                                        </button>
                                    )}

                                    {/* Progress Overlay */}
                                    {item.status !== 'done' && item.status !== 'idle' && (
                                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 p-1">
                                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                                            {item.progress > 0 && (
                                                <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all duration-300"
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
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Text Input Area */}
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl flex items-center p-1 focus-within:border-blue-500/50 transition-colors">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!isSendDisabled) onSubmit(e);
                                    }
                                }}
                                onFocus={() => setTimeout(() => onScrollToBottom(), 100)}
                                placeholder={authLoading ? "Connessione in corso..." : "Descrivi cosa vuoi ristrutturare..."}
                                className="w-full bg-slate-900/50 text-slate-50 caret-blue-500 placeholder:text-slate-400 text-[16px] px-3 py-2 max-h-24 min-h-[44px] focus:outline-none resize-none scrollbar-hide block opacity-100"
                                rows={1}
                                disabled={isLoading || authLoading}
                            />
                        </div>
                    </div>
                )}

                {/* Standard Text Input ONLY if no media (fallback layout) */}
                {mediaItems.length === 0 && (
                    <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl flex items-center p-1 focus-within:border-blue-500/50 transition-colors min-w-0">
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
                            className="w-full bg-slate-900/50 text-slate-50 caret-blue-500 placeholder:text-slate-400 text-[16px] px-3 py-2 max-h-24 min-h-[44px] focus:outline-none resize-none scrollbar-hide block opacity-100"
                            rows={1}
                            disabled={isLoading || authLoading}
                        />
                    </div>
                )}

                <Button
                    onClick={() => onSubmit()}
                    disabled={isSendDisabled}
                    className={cn(
                        "rounded-xl transition-all duration-300 shrink-0 mb-1",
                        !isSendDisabled
                            ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "bg-slate-800 text-slate-500"
                    )}
                    size="icon"
                >
                    <Send className="w-5 h-5" />
                </Button>
            </div>
        </div>
    );
}
