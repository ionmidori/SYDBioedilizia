import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface WelcomeBadgeProps {
    isOpen: boolean;
    onOpenChat: () => void;
}

/**
 * Welcome badge component with typewriter effect
 * Extracted from ChatWidget.tsx (lines 403-484)
 */
export function WelcomeBadge({ isOpen, onOpenChat }: WelcomeBadgeProps) {
    const [showWelcomeBadge, setShowWelcomeBadge] = useState(false);
    const [typewriterText, setTypewriterText] = useState('');
    const fullMessage = "Ciao, sono SYD! Posso aiutarti con il tuo progetto?";

    // Show badge after delay
    useEffect(() => {
        const t = setTimeout(() => !isOpen && setShowWelcomeBadge(true), 3000);
        return () => clearTimeout(t);
    }, [isOpen]);

    // Hide when chat opens
    useEffect(() => {
        if (isOpen) setShowWelcomeBadge(false);
    }, [isOpen]);

    // Typewriter effect
    useEffect(() => {
        if (!showWelcomeBadge || isOpen) {
            setTypewriterText('');
            return;
        }

        let i = 0;
        const interval = setInterval(() => {
            if (i < fullMessage.length) {
                setTypewriterText(fullMessage.slice(0, i + 1));
                i++;
            } else {
                clearInterval(interval);
                setTimeout(() => setShowWelcomeBadge(false), 9000);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [showWelcomeBadge, isOpen]);

    return (
        <AnimatePresence>
            {showWelcomeBadge && !isOpen && (
                <motion.div
                    initial={{ opacity: 0, x: 20, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 10, scale: 0.8 }}
                    className="backdrop-blur-2xl text-white px-3 py-5 rounded-2xl shadow-2xl shadow-blue-400/40 border-2 border-white/40 flex flex-col gap-0 relative mr-1 cursor-pointer hover:shadow-blue-300/60 hover:scale-105 hover:border-white/60 transition-all duration-300 w-40"
                    onClick={onOpenChat}
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%)',
                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.3), 0 20px 40px -10px rgba(59,130,246,0.4)'
                    }}
                >
                    <p className="text-xs text-white font-medium leading-relaxed text-center drop-shadow-sm min-h-[50px] flex items-center justify-center">
                        {typewriterText}
                        {typewriterText.length < fullMessage.length && (
                            <span className="inline-block w-0.5 h-3.5 bg-white ml-0.5 animate-pulse"></span>
                        )}
                    </p>
                    <div
                        className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 backdrop-blur-md rotate-45 border-r-2 border-t-2 border-white/40"
                        style={{ background: 'rgba(255,255,255,0.2)' }}
                    ></div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowWelcomeBadge(false);
                        }}
                        aria-label="Chiudi"
                        className="absolute -top-2 -right-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full p-0.5 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
