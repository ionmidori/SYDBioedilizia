import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatToggleButtonProps {
    isOpen: boolean;
    onClick: () => void;
}

/**
 * Floating toggle button component with avatar animation
 * Extracted from ChatWidget.tsx (lines 486-499)
 */
export function ChatToggleButton({ isOpen, onClick }: ChatToggleButtonProps) {
    return (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Button
                onClick={onClick}
                size="icon"
                aria-label={isOpen ? "Chiudi chat" : "Apri chat"}
                className={cn(
                    "w-32 h-28 rounded-full transition-all duration-300 relative flex items-center justify-center !overflow-visible",
                    isOpen
                        ? "bg-luxury-bg text-luxury-text shadow-2xl border border-luxury-gold/20 w-16 h-16"
                        : "bg-transparent shadow-none border-none hover:scale-105"
                )}
            >
                {isOpen ? (
                    <X className="w-8 h-8 text-luxury-gold" />
                ) : (
                    <>
                        <div className="relative w-full h-full flex items-center justify-center !overflow-visible">
                            <img
                                src="/assets/syd_final_diecut.png"
                                alt="Chat"
                                className="w-full h-full max-w-none object-contain drop-shadow-xl transform transition-transform duration-300"
                            />
                        </div>
                    </>
                )}
            </Button>
        </motion.div>
    );
}
