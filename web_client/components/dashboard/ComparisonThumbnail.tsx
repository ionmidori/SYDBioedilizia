'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Sparkles, Camera } from 'lucide-react';

interface PhotoSlideshowThumbnailProps {
    beforeImage: string;
    afterImage: string;
    alt?: string;
    className?: string;
}

export function ComparisonThumbnail({
    beforeImage,
    afterImage,
    alt = 'Project photos',
    className
}: PhotoSlideshowThumbnailProps) {
    const [showAfter, setShowAfter] = useState(false);

    // Auto-play interval
    useEffect(() => {
        const interval = setInterval(() => {
            setShowAfter((prev) => !prev);
        }, 3000); // 3 seconds per photo
        return () => clearInterval(interval);
    }, []);

    return (
        <div
            className={cn("relative w-full h-full overflow-hidden group select-none", className)}
        >
            {/* BEFORE IMAGE (The original Photo) */}
            <div
                className="absolute inset-0 z-10 transition-opacity duration-1000 ease-in-out"
                style={{ opacity: showAfter ? 0 : 1 }}
            >
                <Image
                    src={beforeImage}
                    alt={`Original ${alt}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition-transform duration-[4000ms] group-hover:scale-105"
                />
            </div>

            {/* AFTER IMAGE (The Render AI) */}
            <div
                className="absolute inset-0 z-20 transition-opacity duration-1000 ease-in-out"
                style={{ opacity: showAfter ? 1 : 0 }}
            >
                <Image
                    src={afterImage}
                    alt={`Render ${alt}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition-transform duration-[4000ms] group-hover:scale-105"
                />
            </div>

            {/* BADGES - Dynamic Status */}
            <div className="absolute top-3 left-3 z-40 flex items-center gap-2 pointer-events-none transition-all duration-500">
                <div className={cn(
                    "px-2.5 py-1 backdrop-blur-md rounded-lg text-[9px] uppercase font-bold tracking-widest shadow-lg flex items-center gap-1.5 transition-all duration-500",
                    showAfter
                        ? "bg-luxury-gold/20 border border-luxury-gold/30 text-luxury-gold shadow-luxury-gold/10"
                        : "bg-luxury-bg/60 border border-white/10 text-white/70"
                )}>
                    {showAfter ? (
                        <>
                            <Sparkles className="w-3 h-3" />
                            Render AI
                        </>
                    ) : (
                        <>
                            <Camera className="w-3 h-3" />
                            Stato Iniziale
                        </>
                    )}
                </div>
            </div>

            {/* Bottom Glow Overlay */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent z-30 pointer-events-none" />

            {/* Progress Bar Indicator */}
            <div className="absolute bottom-4 left-4 right-4 z-40 flex gap-1 pointer-events-none">
                <div className="h-1 flex-1 rounded-full overflow-hidden bg-white/20">
                    <div
                        className="h-full bg-white transition-all duration-[3000ms] ease-linear"
                        style={{ width: !showAfter ? '100%' : '0%', opacity: !showAfter ? 1 : 0 }}
                    />
                </div>
                <div className="h-1 flex-1 rounded-full overflow-hidden bg-white/20">
                    <div
                        className="h-full bg-luxury-gold transition-all duration-[3000ms] ease-linear"
                        style={{ width: showAfter ? '100%' : '0%', opacity: showAfter ? 1 : 0 }}
                    />
                </div>
            </div>
        </div>
    );
}
