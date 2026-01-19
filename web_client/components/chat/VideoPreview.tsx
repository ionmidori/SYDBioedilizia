import React from 'react';
import { Play, X } from 'lucide-react';

interface VideoPreviewProps {
    url: string;
    duration: number;
    onRemove: () => void;
}

/**
 * Video preview component for chat input
 * Shows video thumbnail with duration badge and remove button
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({ url, duration, onRemove }) => {
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="relative group w-20 h-20 rounded-lg overflow-hidden border border-purple-500/30 shadow-lg">
            {/* Video element for thumbnail */}
            <video
                src={url}
                className="w-full h-full object-cover"
                muted
            />

            {/* Play icon overlay */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Play className="w-8 h-8 text-white" fill="white" />
            </div>

            {/* Duration badge */}
            <div className="absolute bottom-1 left-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                {formatDuration(duration)}
            </div>

            {/* Remove button */}
            <button
                className="absolute top-1 right-1 w-5 h-5 bg-red-500/90 hover:bg-red-600 rounded-full flex items-center justify-center opacity-100 transition-opacity shadow-sm backdrop-blur-sm"
                onClick={onRemove}
                title="Rimuovi video"
                type="button"
            >
                <X className="w-3 h-3 text-white" />
            </button>
        </div>
    );
};
