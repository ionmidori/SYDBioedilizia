import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

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
    const [typewriterText, setTypewriterText] = useState('');
    const fullMessage = "Ciao, sono qui per aiutarti a ristrutturare la tua casa!";

    // Show badge after delay
    useEffect(() => {
        const t = setTimeout(() => !isOpen && setShowWelcomeBadge(true), 2500);
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
                    <div className="flex items-center gap-2 mb-1">
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
                    <div
                        className="absolute -right-2 bottom-0 w-4 h-4 bg-luxury-teal/90 backdrop-blur-xl border-b border-r border-luxury-gold/20"
                        style={{
                            clipPath: 'polygon(100% 100%, 0 0, 0 100%)',
                            boxShadow: 'inset -1px -1px 1px rgba(233, 196, 106, 0.2)'
                        }}
                    ></div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
