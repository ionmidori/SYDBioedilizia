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

    // Show badge after delay (or immediately under prefers-reduced-motion)
    useEffect(() => {
        const reducedMotion =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const delayMs = reducedMotion ? 0 : 2500;
        const t = setTimeout(() => !isOpen && !isDismissed && setShowWelcomeBadge(true), delayMs);
        return () => clearTimeout(t);
    }, [isOpen, isDismissed]);

    // Hide when chat opens
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: dismiss the badge as soon as the chat opens
        if (isOpen) setShowWelcomeBadge(false);
    }, [isOpen]);

    // Typewriter effect (instant when prefers-reduced-motion is enabled)
    useEffect(() => {
        if (!showWelcomeBadge || isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset the typewriter when the badge is hidden or the chat opens
            setTypewriterText('');
            return;
        }

        const reducedMotion =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reducedMotion) {
            setTypewriterText(fullMessage);
            const dismissTimer = setTimeout(() => setShowWelcomeBadge(false), 9000);
            return () => clearTimeout(dismissTimer);
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
                    // M3 Expressive Shapes: asymmetric azzurro (primary) bubble
                    className="group bg-primary text-on-primary px-5 py-4 shadow-3 border border-primary-hover flex flex-col gap-2 relative cursor-pointer hover:scale-105 hover:bg-primary-hover transition-all duration-300 w-52 rounded-[24px_24px_4px_24px]"
                    onClick={onOpenChat}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsDismissed(true);
                            setShowWelcomeBadge(false);
                        }}
                        className="absolute top-2 right-2 p-1 text-on-primary hover:text-on-primary transition-colors rounded-full hover:bg-primary-hover z-10"
                        aria-label="Chiudi messaggio di benvenuto"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-2 mb-1 pr-4">
                        <Sparkles className="w-4 h-4 text-on-primary animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-on-primary">
                            Architetto SYD
                        </span>
                    </div>

                    <p className="text-sm font-medium leading-relaxed drop-shadow-sm min-h-[42px] text-on-primary">
                        {typewriterText}
                        {typewriterText.length < fullMessage.length && (
                            <span className="inline-block w-1 h-4 bg-accent ml-1 animate-pulse align-middle rounded-full"></span>
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
                        <path d="M0 0 L11 15 H0 V0Z" className="fill-primary group-hover:fill-primary-hover transition-colors duration-300" />
                        {/* Stroke to match the parent's border on the outer edge */}
                        <path d="M0 0 L11 15" className="stroke-primary-hover" strokeWidth="1" />
                    </svg>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
