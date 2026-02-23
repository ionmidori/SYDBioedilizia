'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { M3Spring, M3Duration, M3EasingFM } from '@/lib/m3-motion';

// ─── Scalloped Shape SVG ─────────────────────────────────────────────────────
// Pre-computed at build time (12-bump scallop, r=36±3.5, viewBox 100×100)
// to avoid SSR/client float divergence in Math.cos/sin.
const SCALLOP_PATH =
    'M 89.5 50 L 89.42 50.69 L 89.17 51.37 L 88.78 52.03 L 88.25 52.67 L 87.61 53.29 L 86.88 53.88 L 86.09 54.43 L 85.29 54.96 L 84.49 55.46 L 83.73 55.95 L 83.04 56.42 L 82.44 56.9 L 81.96 57.38 L 81.61 57.88 L 81.39 58.41 L 81.31 58.98 L 81.37 59.59 L 81.55 60.25 L 81.82 60.96 L 82.18 61.71 L 82.6 62.51 L 83.04 63.35 L 83.47 64.21 L 83.88 65.08 L 84.21 65.95 L 84.46 66.81 L 84.6 67.63 L 84.61 68.4 L 84.48 69.11 L 84.21 69.75 L 83.79 70.3 L 83.24 70.77 L 82.57 71.15 L 81.79 71.44 L 80.92 71.65 L 80 71.8 L 79.04 71.89 L 78.08 71.94 L 77.14 71.97 L 76.24 72.02 L 75.4 72.08 L 74.65 72.19 L 73.99 72.37 L 73.43 72.63 L 72.98 72.98 L 72.63 73.43 L 72.37 73.99 L 72.19 74.65 L 72.08 75.4 L 72.02 76.24 L 71.97 77.14 L 71.94 78.08 L 71.89 79.04 L 71.8 80 L 71.65 80.92 L 71.44 81.79 L 71.15 82.57 L 70.77 83.24 L 70.3 83.79 L 69.75 84.21 L 69.11 84.48 L 68.4 84.61 L 67.63 84.6 L 66.81 84.46 L 65.95 84.21 L 65.08 83.88 L 64.21 83.47 L 63.35 83.04 L 62.51 82.6 L 61.71 82.18 L 60.96 81.82 L 60.25 81.55 L 59.59 81.37 L 58.98 81.31 L 58.41 81.39 L 57.88 81.61 L 57.38 81.96 L 56.9 82.44 L 56.42 83.04 L 55.95 83.73 L 55.46 84.49 L 54.96 85.29 L 54.43 86.09 L 53.88 86.88 L 53.29 87.61 L 52.67 88.25 L 52.03 88.78 L 51.37 89.17 L 50.69 89.42 L 50 89.5 L 49.31 89.42 L 48.63 89.17 L 47.97 88.78 L 47.33 88.25 L 46.71 87.61 L 46.12 86.88 L 45.57 86.09 L 45.04 85.29 L 44.54 84.49 L 44.05 83.73 L 43.58 83.04 L 43.1 82.44 L 42.62 81.96 L 42.12 81.61 L 41.59 81.39 L 41.02 81.31 L 40.41 81.37 L 39.75 81.55 L 39.04 81.82 L 38.29 82.18 L 37.49 82.6 L 36.65 83.04 L 35.79 83.47 L 34.92 83.88 L 34.05 84.21 L 33.19 84.46 L 32.37 84.6 L 31.6 84.61 L 30.89 84.48 L 30.25 84.21 L 29.7 83.79 L 29.23 83.24 L 28.85 82.57 L 28.56 81.79 L 28.35 80.92 L 28.2 80 L 28.11 79.04 L 28.06 78.08 L 28.03 77.14 L 27.98 76.24 L 27.92 75.4 L 27.81 74.65 L 27.63 73.99 L 27.37 73.43 L 27.02 72.98 L 26.57 72.63 L 26.01 72.37 L 25.35 72.19 L 24.6 72.08 L 23.76 72.02 L 22.86 71.97 L 21.92 71.94 L 20.96 71.89 L 20 71.8 L 19.08 71.65 L 18.21 71.44 L 17.43 71.15 L 16.76 70.77 L 16.21 70.3 L 15.79 69.75 L 15.52 69.11 L 15.39 68.4 L 15.4 67.63 L 15.54 66.81 L 15.79 65.95 L 16.12 65.08 L 16.53 64.21 L 16.96 63.35 L 17.4 62.51 L 17.82 61.71 L 18.18 60.96 L 18.45 60.25 L 18.63 59.59 L 18.69 58.98 L 18.61 58.41 L 18.39 57.88 L 18.04 57.38 L 17.56 56.9 L 16.96 56.42 L 16.27 55.95 L 15.51 55.46 L 14.71 54.96 L 13.91 54.43 L 13.12 53.88 L 12.39 53.29 L 11.75 52.67 L 11.22 52.03 L 10.83 51.37 L 10.58 50.69 L 10.5 50 L 10.58 49.31 L 10.83 48.63 L 11.22 47.97 L 11.75 47.33 L 12.39 46.71 L 13.12 46.12 L 13.91 45.57 L 14.71 45.04 L 15.51 44.54 L 16.27 44.05 L 16.96 43.58 L 17.56 43.1 L 18.04 42.62 L 18.39 42.12 L 18.61 41.59 L 18.69 41.02 L 18.63 40.41 L 18.45 39.75 L 18.18 39.04 L 17.82 38.29 L 17.4 37.49 L 16.96 36.65 L 16.53 35.79 L 16.12 34.92 L 15.79 34.05 L 15.54 33.19 L 15.4 32.37 L 15.39 31.6 L 15.52 30.89 L 15.79 30.25 L 16.21 29.7 L 16.76 29.23 L 17.43 28.85 L 18.21 28.56 L 19.08 28.35 L 20 28.2 L 20.96 28.11 L 21.92 28.06 L 22.86 28.03 L 23.76 27.98 L 24.6 27.92 L 25.35 27.81 L 26.01 27.63 L 26.57 27.37 L 27.02 27.02 L 27.37 26.57 L 27.63 26.01 L 27.81 25.35 L 27.92 24.6 L 27.98 23.76 L 28.03 22.86 L 28.06 21.92 L 28.11 20.96 L 28.2 20 L 28.35 19.08 L 28.56 18.21 L 28.85 17.43 L 29.23 16.76 L 29.7 16.21 L 30.25 15.79 L 30.89 15.52 L 31.6 15.39 L 32.37 15.4 L 33.19 15.54 L 34.05 15.79 L 34.92 16.12 L 35.79 16.53 L 36.65 16.96 L 37.49 17.4 L 38.29 17.82 L 39.04 18.18 L 39.75 18.45 L 40.41 18.63 L 41.02 18.69 L 41.59 18.61 L 42.12 18.39 L 42.62 18.04 L 43.1 17.56 L 43.58 16.96 L 44.05 16.27 L 44.54 15.51 L 45.04 14.71 L 45.57 13.91 L 46.12 13.12 L 46.71 12.39 L 47.33 11.75 L 47.97 11.22 L 48.63 10.83 L 49.31 10.58 L 50 10.5 L 50.69 10.58 L 51.37 10.83 L 52.03 11.22 L 52.67 11.75 L 53.29 12.39 L 53.88 13.12 L 54.43 13.91 L 54.96 14.71 L 55.46 15.51 L 55.95 16.27 L 56.42 16.96 L 56.9 17.56 L 57.38 18.04 L 57.88 18.39 L 58.41 18.61 L 58.98 18.69 L 59.59 18.63 L 60.25 18.45 L 60.96 18.18 L 61.71 17.82 L 62.51 17.4 L 63.35 16.96 L 64.21 16.53 L 65.08 16.12 L 65.95 15.79 L 66.81 15.54 L 67.63 15.4 L 68.4 15.39 L 69.11 15.52 L 69.75 15.79 L 70.3 16.21 L 70.77 16.76 L 71.15 17.43 L 71.44 18.21 L 71.65 19.08 L 71.8 20 L 71.89 20.96 L 71.94 21.92 L 71.97 22.86 L 72.02 23.76 L 72.08 24.6 L 72.19 25.35 L 72.37 26.01 L 72.63 26.57 L 72.98 27.02 L 73.43 27.37 L 73.99 27.63 L 74.65 27.81 L 75.4 27.92 L 76.24 27.98 L 77.14 28.03 L 78.08 28.06 L 79.04 28.11 L 80 28.2 L 80.92 28.35 L 81.79 28.56 L 82.57 28.85 L 83.24 29.23 L 83.79 29.7 L 84.21 30.25 L 84.48 30.89 L 84.61 31.6 L 84.6 32.37 L 84.46 33.19 L 84.21 34.05 L 83.88 34.92 L 83.47 35.79 L 83.04 36.65 L 82.6 37.49 L 82.18 38.29 L 81.82 39.04 L 81.55 39.75 L 81.37 40.41 L 81.31 41.02 L 81.39 41.59 L 81.61 42.12 L 81.96 42.62 L 82.44 43.1 L 83.04 43.58 L 83.73 44.05 L 84.49 44.54 L 85.29 45.04 L 86.09 45.57 L 86.88 46.12 L 87.61 46.71 L 88.25 47.33 L 88.78 47.97 L 89.17 48.63 L 89.42 49.31 L 89.5 50 Z';

/** Inline scalloped spinner — use inside page content for data-loading states */
export function ScallopedSpinner({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 100 100" className={className}>
            {/* Track */}
            <path
                d={SCALLOP_PATH}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="opacity-20"
            />
            {/* Arc */}
            <path
                d={SCALLOP_PATH}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray="25 100"
            />
        </svg>
    );
}

/** Centered inline loader — replaces page content while data is fetching */
export function ScallopedInlineLoader() {
    return (
        <div className="flex items-center justify-center min-h-[400px] h-full w-full">
            <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={M3Spring.standard}
            >
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                    <ScallopedSpinner className="w-10 h-10 text-luxury-gold" />
                </motion.div>
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
                            className="absolute inset-0 rounded-full bg-luxury-gold/10"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
                            transition={{
                                duration: 1.8,
                                repeat: Infinity,
                                ease: 'easeInOut',
                            }}
                        />

                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: 'linear',
                            }}
                        >
                            <ScallopedSpinner className="w-14 h-14 text-luxury-gold" />
                        </motion.div>
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
