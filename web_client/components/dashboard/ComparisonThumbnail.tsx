'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { ArrowLeftRight } from 'lucide-react';

interface ComparisonThumbnailProps {
    beforeImage: string;
    afterImage: string;
    alt?: string;
    className?: string;
}

export function ComparisonThumbnail({
    beforeImage,
    afterImage,
    alt = 'Project comparison',
    className
}: ComparisonThumbnailProps) {
    const [sliderX, setSliderX] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percentage = (x / rect.width) * 100;
        setSliderX(percentage);
    }, []);

    const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);

    return (
        <div
            ref={containerRef}
            className={cn("relative w-full h-full overflow-hidden cursor-ew-resize group select-none", className)}
            onMouseMove={onMouseMove}
            onTouchMove={onTouchMove}
            onMouseLeave={() => setSliderX(50)}
        >
            {/* AFTER IMAGE (The Render) - Always in background */}
            <div className="absolute inset-0 z-0">
                <Image
                    src={afterImage}
                    alt={`After ${alt}`}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
            </div>

            {/* BEFORE IMAGE (The Photo) - Clipped with soft edge blur */}
            <div
                className="absolute inset-0 z-10 overflow-hidden"
                style={{
                    clipPath: `inset(0 ${100 - sliderX}% 0 0)`,
                    transition: 'clip-path 0.1s ease-out'
                }}
            >
                <div className="relative w-full h-full">
                    <Image
                        src={beforeImage}
                        alt={`Before ${alt}`}
                        fill
                        className="object-cover"
                    />
                    {/* Dynamic Blur Transition Overlay */}
                    <div
                        className="absolute inset-0 bg-black/10 backdrop-blur-[2px] pointer-events-none"
                        style={{ opacity: sliderX / 100 }}
                    />
                </div>
            </div>

            {/* TRANSITION EDGE (The Light Ray) */}
            <div
                className="absolute top-0 bottom-0 z-20 w-[2px] bg-gradient-to-b from-transparent via-luxury-gold to-transparent shadow-[0_0_15px_rgba(233,196,106,0.5)] pointer-events-none transition-all duration-100 ease-out"
                style={{ left: `${sliderX}%` }}
            />

            {/* HANDLE CONTROL */}
            <div
                className="absolute top-1/2 -translate-y-1/2 z-30 pointer-events-none transition-all duration-100 ease-out"
                style={{ left: `${sliderX}%`, transform: `translate(-50%, -50%)` }}
            >
                <div className="w-8 h-8 rounded-full bg-luxury-bg/80 backdrop-blur-xl border border-luxury-gold/50 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.4)] group-hover:scale-110 transition-transform">
                    <ArrowLeftRight className="w-4 h-4 text-luxury-gold" />
                </div>
            </div>

            {/* BADGES - Golden Glassmorphism */}
            <div className="absolute top-3 left-3 z-40 flex items-center gap-2 pointer-events-none">
                <div className="px-2 py-1 bg-luxury-bg/60 backdrop-blur-md border border-white/10 rounded-lg text-[9px] uppercase font-bold tracking-widest text-white/70 shadow-lg">
                    Foto Originale
                </div>
            </div>

            <div className="absolute top-3 right-3 z-40 flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="px-2 py-1 bg-luxury-gold/20 backdrop-blur-md border border-luxury-gold/30 rounded-lg text-[9px] uppercase font-bold tracking-widest text-luxury-gold shadow-lg shadow-luxury-gold/10">
                    Render AI
                </div>
            </div>

            {/* Bottom Glow Overlay */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent z-10 pointer-events-none" />
        </div>
    );
}
