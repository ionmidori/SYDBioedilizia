"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SydLoaderProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

/**
 * SydLoader - Unified M3 Expressive Loading Indicator
 * 
 * Implements the "Circle to Wavy Spiral" motion pattern from 2026 Google M3 Guidelines.
 * It uses optical illusion via counter-rotating, morphing rounded polygons to create
 * a dynamic, expressive loading state without complex SVG path morphing.
 */
export function SydLoader({ size = 'md', className }: SydLoaderProps) {
    const sizeMap = {
        sm: 'w-4 h-4 border-[1.5px]',
        md: 'w-5 h-5 border-2',
        lg: 'w-10 h-10 border-3',
        xl: 'w-16 h-16 border-[4px]'
    };

    const containerSizeMap = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-10 h-10',
        xl: 'w-16 h-16'
    };

    return (
        <div className={cn("relative flex items-center justify-center", containerSizeMap[size], className)}>
            {/* Outer morphing shape (Circle -> Wavy/Spiral boundary) */}
            <motion.div
                animate={{
                    borderRadius: [
                        "50% 50% 50% 50%", 
                        "60% 40% 30% 70% / 60% 30% 70% 40%", 
                        "40% 60% 70% 30% / 40% 70% 30% 60%", 
                        "50% 50% 50% 50%"
                    ],
                    rotate: [0, 360],
                    scale: [1, 1.15, 1]
                }}
                transition={{
                    rotate: {
                        duration: 3,
                        ease: "linear",
                        repeat: Infinity,
                    },
                    borderRadius: {
                        duration: 4,
                        ease: "easeInOut",
                        repeat: Infinity,
                    },
                    scale: {
                        duration: 2.5,
                        ease: "easeInOut",
                        repeat: Infinity,
                    }
                }}
                className={cn(
                    "absolute border-luxury-gold",
                    "shadow-[0_0_10px_rgba(233,196,106,0.4)]",
                    sizeMap[size]
                )}
            />
            {/* Inner inverse morphing shape to create spiral optical illusion */}
            <motion.div
                animate={{
                    borderRadius: [
                        "50% 50% 50% 50%", 
                        "30% 70% 70% 30% / 30% 30% 70% 70%", 
                        "70% 30% 30% 70% / 70% 70% 30% 30%", 
                        "50% 50% 50% 50%"
                    ],
                    rotate: [360, 0],
                    scale: [0.5, 0.7, 0.5]
                }}
                transition={{
                    rotate: {
                        duration: 3,
                        ease: "linear",
                        repeat: Infinity,
                    },
                    borderRadius: {
                        duration: 4,
                        ease: "easeInOut",
                        repeat: Infinity,
                    },
                    scale: {
                        duration: 2.5,
                        ease: "easeInOut",
                        repeat: Infinity,
                    }
                }}
                className={cn(
                    "absolute border-luxury-gold border-t-transparent border-l-transparent",
                    sizeMap[size]
                )}
                style={{ opacity: 0.9 }}
            />
        </div>
    );
}
