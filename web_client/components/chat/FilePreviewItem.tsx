"use client";

/**
 * FilePreviewItem - Unified Preview Component for Uploads.
 *
 * Displays a preview with:
 * - Image thumbnails (via blob URL)
 * - Video icons (for video files)
 * - Progress overlay during upload
 * - Error state handling
 * - Cancel/Remove button
 *
 * Uses the new `UploadItem` type from `useUpload` hook.
 */
import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X, Loader2, FileVideo, AlertCircle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import type { UploadItem, UploadStatus } from '@/types/media';

interface FilePreviewItemProps {
    /** The upload item state */
    item: UploadItem;
    /** Callback to remove/cancel this item */
    onRemove: (id: string) => void;
    /** Callback to retry a failed upload */
    onRetry?: (id: string) => void;
    /** Optional: Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Optional: Hide remove button */
    hideRemove?: boolean;
}

const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-20 h-20',
    lg: 'w-24 h-24',
};

/**
 * Returns status-specific UI elements.
 */
function getStatusInfo(status: UploadStatus): {
    showOverlay: boolean;
    showProgress: boolean;
    overlayColor: string;
    icon?: React.ReactNode;
} {
    switch (status) {
        case 'compressing':
            return {
                showOverlay: true,
                showProgress: false,
                overlayColor: 'bg-black/60',
                icon: <Loader2 className="w-4 h-4 animate-spin text-luxury-teal" />,
            };
        case 'uploading':
            return {
                showOverlay: true,
                showProgress: true,
                overlayColor: 'bg-black/60',
                icon: <Loader2 className="w-4 h-4 animate-spin text-white" />,
            };
        case 'error':
            return {
                showOverlay: true,
                showProgress: false,
                overlayColor: 'bg-red-900/80',
                icon: <AlertCircle className="w-4 h-4 text-white" />,
            };
        case 'success':
        case 'idle':
        default:
            return {
                showOverlay: false,
                showProgress: false,
                overlayColor: '',
            };
    }
}

export function FilePreviewItem({
    item,
    onRemove,
    onRetry,
    size = 'md',
    hideRemove = false,
}: FilePreviewItemProps) {
    const isImage = item.file.type.startsWith('image/');
    const isVideo = item.file.type.startsWith('video/');
    const statusInfo = getStatusInfo(item.status);

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove(item.id);
    };

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRetry?.(item.id);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            // Upload state is otherwise conveyed only by a spinner/overlay colour;
            // exposing it lets E2E await a state instead of racing an animation.
            data-testid="file-preview"
            data-upload-status={item.status}
            className={cn(
                'relative group rounded-lg overflow-hidden border shadow-lg',
                sizeClasses[size],
                item.status === 'error'
                    ? 'border-red-500/50'
                    : 'border-luxury-gold/20',
                'bg-luxury-bg/50'
            )}
            role="listitem"
            aria-label={`File: ${item.file.name}`}
        >
            {/* Preview Content */}
            {isImage && (
                <div className="relative w-full h-full">
                    <Image
                        src={item.previewUrl}
                        alt={`Anteprima: ${item.file.name}`}
                        fill
                        className={cn(
                            'object-cover transition-opacity',
                            statusInfo.showOverlay ? 'opacity-60' : 'opacity-100'
                        )}
                        sizes="80px"
                        unoptimized
                    />
                </div>
            )}

            {isVideo && (
                <div className="w-full h-full flex items-center justify-center bg-luxury-bg">
                    <FileVideo className="w-8 h-8 text-luxury-teal" />
                </div>
            )}

            {/* Fallback for other file types */}
            {!isImage && !isVideo && (
                <div className="w-full h-full flex items-center justify-center bg-luxury-bg">
                    <ImageIcon className="w-6 h-6 text-luxury-text/40" />
                </div>
            )}

            {/* Status Overlay */}
            {statusInfo.showOverlay && (
                <div
                    className={cn(
                        'absolute inset-0 flex flex-col items-center justify-center gap-1 p-1',
                        statusInfo.overlayColor
                    )}
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    {statusInfo.icon}

                    {/* Progress Bar */}
                    {statusInfo.showProgress && item.progress > 0 && (
                        <div className="w-full max-w-[80%] bg-slate-700 h-1 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-luxury-teal"
                                initial={{ width: 0 }}
                                animate={{ width: `${item.progress}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                    )}

                    {/* Compressing label */}
                    {item.status === 'compressing' && (
                        <span className="text-[10px] text-luxury-teal font-medium">
                            Compressing...
                        </span>
                    )}

                    {/* Error message and retry */}
                    {item.status === 'error' && (
                        <>
                            <span className="text-[10px] text-white font-bold">Failed</span>
                            {onRetry && (
                                <button
                                    onClick={handleRetry}
                                    className="mt-1 p-1 rounded-full bg-white/20 hover:bg-white/40 transition-colors"
                                    aria-label="Retry upload"
                                >
                                    <RefreshCw className="w-3 h-3 text-white" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Remove/Cancel Button */}
            {!hideRemove && (
                <button
                    className={cn(
                        'absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white transition-all z-10',
                        'bg-black/50 hover:bg-black/80',
                        'opacity-70 group-hover:opacity-100'
                    )}
                    onClick={handleRemove}
                    aria-label={
                        item.status === 'uploading'
                            ? `Cancel upload: ${item.file.name}`
                            : `Remove file: ${item.file.name}`
                    }
                >
                    <X className="w-3 h-3" />
                </button>
            )}

            {/* Success Indicator */}
            {item.status === 'success' && (
                <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            )}
        </motion.div>
    );
}
