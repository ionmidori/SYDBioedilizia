"use client";

import React from 'react';
import { motion, Variants } from 'framer-motion';

export const TypingDots = () => {
    const dotVariants: Variants = {
        initial: { 
            y: 0, 
            opacity: 0.4 
        },
        animate: (i: number) => ({ 
            y: [0, -6, 0], 
            opacity: [0.4, 1, 0.4],
            transition: { 
                repeat: Infinity, 
                duration: 0.8, 
                ease: "easeInOut",
                delay: i * 0.15 
            }
        })
    };

    return (
        <div className="flex gap-1.5 items-center px-2 py-1">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    custom={i}
                    variants={dotVariants}
                    initial="initial"
                    animate="animate"
                    className="w-2 h-2 rounded-full bg-luxury-gold/60"
                />
            ))}
        </div>
    );
};
