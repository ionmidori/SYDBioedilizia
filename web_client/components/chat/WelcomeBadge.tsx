import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

interface WelcomeBadgeProps {
    isOpen: boolean;
    onOpenChat: () => void;
}

/**
 * Welcome badge component with typewriter effect and M3 Expressive Design
 * Uses asymmetric bubble shapes and spring motion physics.
 */
export function WelcomeBadge({ isOpen, onOpenChat }: WelcomeBadgeProps) {
    const [showWelcomeBadge, setShowWelcomeBadge] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const [typewriterText, setTypewriterText] = useState('');
    const fullMessage = "Ciao, sono qui per aiutarti a ristrutturare la tua casa!";

    // Show badge after delay
    useEffect(() => {
        const t = setTimeout(() => !isOpen && !isDismissed && setShowWelcomeBadge(true), 2500);
        return () => clearTimeout(t);
    }, [isOpen, isDismissed]);

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
        }, 35); // Slightly faster typewriter for modern feel

        return () => clearInterval(interval);
    }, [showWelcomeBadge, isOpen]);

    return (
        <AnimatePresence>
            {showWelcomeBadge && !isOpen && (
                <motion.div
                    // M3 Expressive Motion Pattern: Spring with bounce
                    initial={{ opacity: 0, scale: 0.8, x: 20, y: 10 }}
                    animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 10, y: 5 }}
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 18,
                        mass: 0.8
                    }}
                    // M3 Expressive Shapes: Asymmetric bubble (rounded-[24px_24px_4px_24px]) + Glassmorphism
                    className="backdrop-blur-xl bg-luxury-teal/90 text-white px-5 py-4 shadow-2xl border border-luxury-gold/20 flex flex-col gap-2 relative cursor-pointer hover:shadow-luxury-gold/20 hover:scale-105 hover:bg-luxury-teal transition-colors duration-300 w-52 rounded-[24px_24px_4px_24px]"
                    onClick={onOpenChat}
                    style={{
                        boxShadow: '0 8px 32px -8px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)'
                    }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsDismissed(true);
                            setShowWelcomeBadge(false);
                        }}
                        className="absolute top-2 right-2 p-1 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10 z-10"
                        aria-label="Chiudi messaggio di benvenuto"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-2 mb-1 pr-4">
                        <Sparkles className="w-4 h-4 text-luxury-gold animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-luxury-gold/80">
                            Architetto SYD
                        </span>
                    </div>

                    <p className="text-sm font-medium leading-relaxed drop-shadow-sm min-h-[42px]">
                        {typewriterText}
                        {typewriterText.length < fullMessage.length && (
                            <span className="inline-block w-1 h-4 bg-luxury-gold ml-1 animate-pulse align-middle rounded-full"></span>
                        )}
                    </p>

                    {/* The pointer triangle (tail) for the chat bubble */}
                    <svg 
                        className="absolute -right-[10px] bottom-[-1px] w-[11px] h-[15px]"
                        viewBox="0 0 11 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        {/* Solid fill to hide the parent border underneath and prevent translucent double-overlap */}
                        <path d="M0 0 L11 15 H0 V0Z" className="fill-luxury-teal" />
                        {/* Stroke to match the parent's border on the outer edge */}
                        <path d="M0 0 L11 15" className="stroke-luxury-gold/20" strokeWidth="1" />
                    </svg>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
