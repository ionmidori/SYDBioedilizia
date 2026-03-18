"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { M3Spring } from '@/lib/m3-motion';

interface FloatingBatchBarProps {
    selectedCount: number;
    onSubmit: () => void;
    onCancel: () => void;
}

export function FloatingBatchBar({ selectedCount, onSubmit, onCancel }: FloatingBatchBarProps) {
    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={M3Spring.expressive}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg"
                >
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl bg-luxury-bg/95 border border-luxury-teal/30 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(42,157,143,0.15)]">
                        {/* Left: counter */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onCancel}
                                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-luxury-text/60 hover:text-luxury-text transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-bold text-luxury-text">
                                <span className="text-luxury-teal">{selectedCount}</span>
                                {' '}progett{selectedCount === 1 ? 'o' : 'i'} selezionat{selectedCount === 1 ? 'o' : 'i'}
                            </span>
                        </div>

                        {/* Right: submit CTA */}
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            transition={M3Spring.bouncy}
                            onClick={onSubmit}
                            className="flex items-center gap-2.5 px-5 py-2.5 bg-luxury-teal/20 hover:bg-luxury-teal/30 border border-luxury-teal/40 hover:border-luxury-teal/60 rounded-xl text-luxury-teal font-bold text-sm tracking-wide transition-all duration-300 shadow-lg shadow-luxury-teal/10"
                        >
                            <Send className="w-4 h-4" />
                            <span>Richiedi Preventivo</span>
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
