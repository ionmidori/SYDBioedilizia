import React, { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
    inputValue: string;
    setInputValue: (value: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    isLoading: boolean;
    isUploading?: boolean; // New prop
    uploadStatus?: string; // New prop
    selectedImages: string[];
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onScrollToBottom: () => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
    removeImage?: (index: number) => void;
}

/**
 * Chat input component with textarea, file upload, and send button
 * Extracted from ChatWidget.tsx (lines 561-581)
 */
export function ChatInput({
    inputValue,
    setInputValue,
    onSubmit,
    isLoading,
    isUploading = false,
    uploadStatus = '',
    selectedImages,
    onFileSelect,
    onScrollToBottom,
    fileInputRef,
    removeImage
}: ChatInputProps) {
    return (
        <div
            className="px-4 border-t border-white/10 backdrop-blur-md flex-shrink-0 w-full"
            style={{ backgroundColor: '#0b1120', paddingTop: '10px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
        >
            {/* Upload Status Indicator */}
            {uploadStatus && (
                <div className="text-xs text-blue-400 mb-1 ml-1 animate-pulse font-medium">
                    {uploadStatus}
                </div>
            )}

            <div className="flex gap-2 items-end max-w-full">
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-white shrink-0 relative"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isUploading}
                >
                    {isUploading ? (
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

                {/* ✅ NEW: Optimistic Image Preview (before sending) */}
                {selectedImages.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                        {selectedImages.map((img, idx) => (
                            <div
                                key={idx}
                                className="relative group w-20 h-20 rounded-lg overflow-hidden border border-blue-500/30 shadow-lg"
                            >
                                <img
                                    src={img}
                                    alt={`Selected ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                />
                                <button
                                    className="absolute top-1 right-1 w-5 h-5 bg-red-500/90 hover:bg-red-600 rounded-full flex items-center justify-center opacity-100 transition-opacity shadow-sm backdrop-blur-sm"
                                    onClick={() => removeImage && removeImage(idx)}
                                    title="Rimuovi immagine"
                                >
                                    <span className="text-white font-bold text-xs leading-none" style={{ marginTop: '-1px' }}>×</span>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

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
                        placeholder="Descrivi cosa vuoi ristrutturare..."
                        className="w-full bg-slate-900/50 text-slate-50 caret-blue-500 placeholder:text-slate-400 text-[16px] px-3 py-2 max-h-24 min-h-[44px] focus:outline-none resize-none scrollbar-hide block opacity-100"
                        rows={1}
                        disabled={isLoading}
                    />
                </div>

                <Button
                    onClick={() => onSubmit()}
                    disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
                    className={cn(
                        "rounded-xl transition-all duration-300 shrink-0",
                        inputValue.trim() || selectedImages.length > 0
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
