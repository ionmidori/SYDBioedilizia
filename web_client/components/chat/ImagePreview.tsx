import React from 'react';
import { Minimize2 } from 'lucide-react';

interface ImagePreviewProps {
    src: string;
    alt?: string;
    onClick: (url: string) => void;
    className?: string;
}

/**
 * Reusable image preview component with hover overlay
 * ✅ BUG FIX #14: Refactored duplicated image rendering logic
 */
export function ImagePreview({ src, alt = 'Generated image', onClick, className = '' }: ImagePreviewProps) {
    return (
        <span
            className={`group relative mt-2 cursor-pointer overflow-hidden rounded-lg border border-white/10 block ${className}`}
            onClick={() => onClick(src)}
        >
            <img
                src={src}
                alt={alt}
                className="max-w-full h-auto transition-transform hover:scale-105"
            />
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-xs text-white font-medium bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/20 flex items-center gap-1">
                    <Minimize2 className="w-3 h-3 rotate-45" /> Espandi
                </span>
            </span>
        </span>
    );
}
