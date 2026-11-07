"use client";

import React from 'react';
import { motion } from 'framer-motion';

export const M3LoaderShape = () => {
    // M3 Expressive Typing/Thinking Indicator
    // Utilizza 3 elementi distinti con animazione a cascata (staggered) 
    // e morphing geometrico per risultare molto più leggibili e definiti.
    
    return (
        <div className="flex items-center gap-[4px] h-5 px-1">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className="w-2 h-2 bg-accent shadow-[0_0_8px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]"
                    animate={{
                        scale: [0.6, 1.2, 0.6],
                        borderRadius: ["50%", "25%", "50%"],
                        rotate: [0, 90, 180],
                        opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.2 // Stagger effect
                    }}
                    style={{
                        originX: 0.5, 
                        originY: 0.5 
                    }}
                />
            ))}
        </div>
    );
};

