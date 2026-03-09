'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { M3Spring, M3Duration, M3EasingFM } from '@/lib/m3-motion';
import { SydLoader } from './SydLoader';

/** Centered inline loader — replaces page content while data is fetching */
export function ScallopedInlineLoader() {
    return (
        <div className="flex items-center justify-center min-h-[400px] h-full w-full">
            <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={M3Spring.standard}
            >
                <SydLoader size="lg" />
            </motion.div>
        </div>
    );
}

// ─── Overlay Component ───────────────────────────────────────────────────────

interface ScallopedPageTransitionProps {
    isNavigating: boolean;
}

export function ScallopedPageTransition({ isNavigating }: ScallopedPageTransitionProps) {
    return (
        <AnimatePresence>
            {isNavigating && (
                <motion.div
                    key="page-transition-overlay"
                    className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        duration: M3Duration.medium1,
                        ease: M3EasingFM.standard,
                    }}
                >
                    {/* Scrim */}
                    <motion.div
                        className="absolute inset-0 bg-luxury-bg/70 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: M3Duration.medium2 }}
                    />

                    {/* Spinner */}
                    <motion.div
                        className="relative z-10"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={M3Spring.standard}
                    >
                        {/* Pulse ring */}
                        <motion.div
                            className="absolute inset-0 rounded-full bg-luxury-gold/20"
                            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeOut",
                            }}
                        />

                        <SydLoader size="xl" />
                    </motion.div>

                    {/* Bottom sheet hint — slides up from bottom */}
                    <motion.div
                        className="absolute bottom-0 left-0 right-0 h-20 bg-white/[0.03] rounded-t-[32px] border-t border-luxury-gold/10"
                        initial={{ y: '100%' }}
                        animate={{ y: '0%' }}
                        exit={{ y: '100%' }}
                        transition={{
                            delay: 0.15,
                            duration: M3Duration.long1,
                            ease: [0.32, 0.72, 0, 1],
                        }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
