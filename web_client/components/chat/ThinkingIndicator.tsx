import React from 'react';
import { motion } from 'framer-motion';

interface ThinkingIndicatorProps {
    message?: string;
}

export const ThinkingIndicator = ({ message }: ThinkingIndicatorProps) => {
    // Default text if message is undefined OR empty string
    const displayMessage = message && message.trim().length > 0 ? message : "Elaborazione...";

    console.log('[ThinkingIndicator] Render:', { message, displayMessage });

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-luxury-gold/5 border border-luxury-gold/10 animate-pulse">
            <span className="text-xl">🧠</span>
            <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-luxury-gold">
                    {displayMessage === "Elaborazione..." ? "Sto analizzando la richiesta..." : displayMessage}
                </span>
                <span className="text-[10px] text-luxury-gold/60">
                    L'intelligenza artificiale sta elaborando...
                </span>
            </div>
        </div>
    );
};
