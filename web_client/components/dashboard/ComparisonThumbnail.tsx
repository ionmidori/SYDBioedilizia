'use client';

import { useState, useRef, useEffect } from 'react';
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
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isHovering, setIsHovering] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = (x / rect.width) * 100;
        setSliderPosition(percentage);
    };

    // Auto-animate when NOT interacting
    useEffect(() => {
        if (isHovering) return;

        const interval = setInterval(() => {
            // Simple subtle breathing effect or auto-slide could go here
            // distinct from user interaction. For now, reset to center.
            setSliderPosition(50);
        }, 100);

        return () => clearInterval(interval);
    }, [isHovering]);

    // Actually simpler: Just reset to 50 when mouse leaves
    const handleMouseLeave = () => {
        setIsHovering(false);
        setSliderPosition(50);
    };

    return (
        <div
            ref={containerRef}
            className={cn("relative w-full h-full overflow-hidden cursor-ew-resize group", className)}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={handleMouseLeave}
        >
            {/* After Image (Full Background) */}
            <Image
                src={afterImage}
                alt={`After ${alt}`}
                fill
                className="object-cover"
            />

            {/* Before Image (Clipped Overlay) */}
            <div
                className="absolute inset-0 z-10 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
                <Image
                    src={beforeImage}
                    alt={`Before ${alt}`}
                    fill
                    className="object-cover"
                />
            </div>

            {/* Drag Handle */}
            <div
                className="absolute top-0 bottom-0 z-20 w-1 bg-white/50 backdrop-blur-sm shadow-xl pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
            >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white/20 backdrop-blur-md rounded-full shadow-lg border border-white/40 flex items-center justify-center">
                    <ArrowLeftRight className="w-3 h-3 text-white" />
                </div>
            </div>

            {/* Badges */}
            <div className="absolute top-2 left-2 z-30 px-2 py-0.5 bg-black/40 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white/80 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                Prima
            </div>
            <div className="absolute top-2 right-2 z-30 px-2 py-0.5 bg-luxury-gold/40 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                Dopo
            </div>
        </div>
    );
}
