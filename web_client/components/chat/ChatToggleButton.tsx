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
                className={cn(
                    "w-32 h-28 rounded-full transition-all duration-300 relative flex items-center justify-center !overflow-visible",
                    isOpen
                        ? "bg-slate-800 text-white shadow-2xl border border-white/10 w-16 h-16"
                        : "bg-transparent shadow-none border-none hover:scale-105"
                )}
            >
                {isOpen ? (
                    <X className="w-8 h-8" />
                ) : (
                    <>
                        <div className="relative w-full h-full flex items-center justify-center !overflow-visible">
                            <img
                                src="/assets/syd_final_diecut.png"
                                alt="Chat"
                                className="w-full h-full max-w-none object-contain drop-shadow-xl transform transition-transform duration-300"
                            />
                        </div>
                        <span className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse z-10" />
                    </>
                )}
            </Button>
        </motion.div>
    );
}
