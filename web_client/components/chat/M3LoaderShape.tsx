"use client";

import React from 'react';
import { motion } from 'framer-motion';

export const M3LoaderShape = () => {
    // M3 Expressive Morphing Sequence - Organic Fluid Shapes
    // Using complex border-radius values to create "blob" effects
    
    return (
        <motion.div
            animate={{
                borderRadius: [
                    "20% 20% 20% 20%",                  // 1. Squircle (Foundation)
                    "60% 40% 30% 70% / 60% 30% 70% 40%", // 2. Blob 1 (Fluid Thought)
                    "50% 50% 50% 50%",                  // 3. Circle (Perfection)
                    "30% 70% 70% 30% / 30% 30% 70% 70%", // 4. Blob 2 (Expansion)
                    "20% 20% 20% 20%"                   // 5. Return to Squircle
                ],
                rotate: [0, 90, 180, 270, 360],
                scale: [1, 1.1, 1, 1.1, 1],
            }}
            transition={{
                duration: 8, // Slow, meditative cycle
                ease: "easeInOut",
                times: [0, 0.25, 0.5, 0.75, 1],
                repeat: Infinity,
                repeatType: "loop"
            }}
            className="w-5 h-5 bg-luxury-gold shadow-[0_0_12px_rgba(233,196,106,0.4)]"
            style={{
                // Ensure initial centering transform origin
                originX: 0.5, 
                originY: 0.5 
            }}
        />
    );
};
