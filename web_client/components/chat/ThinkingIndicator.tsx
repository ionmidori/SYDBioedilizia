import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThinkingIndicatorProps {
    message?: string;       // Legacy explicit message
    statusMessage?: string | null; // New dynamic status from backend
}

export const ThinkingIndicator = ({ message, statusMessage }: ThinkingIndicatorProps) => {
    // Priority: Explicit Message (rare) > Dynamic Status > Default Fallback
    const effectiveMessage = message && message.trim().length > 0
        ? message
        : (statusMessage || "Elaborazione...");

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-luxury-gold/5 border border-luxury-gold/10 animate-pulse">
            <span className="text-xl">🧠</span>
            <div className="flex flex-col gap-0.5">
                <AnimatePresence mode="wait">
                    <motion.span
                        key={effectiveMessage}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm font-medium text-luxury-gold"
                    >
                        {effectiveMessage === "Elaborazione..." ? "Sto analizzando la richiesta..." : effectiveMessage}
                    </motion.span>
                </AnimatePresence>
                <span className="text-[10px] text-luxury-gold/60">
                    L'intelligenza artificiale sta lavorando per te...
                </span>
            </div>
        </div>
    );
};
