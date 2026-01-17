'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import Image from 'next/image';

interface SlideShowModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SlideShowModal({ isOpen, onClose }: SlideShowModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Reset index when opening
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    // Keyboard navigation (only Escape needed now)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Slide variants for animations
    const variants = {
        enter: () => ({
            opacity: 0,
            scale: 0.95
        }),
        center: {
            zIndex: 1,
            opacity: 1,
            scale: 1
        },
        exit: () => ({
            zIndex: 0,
            opacity: 0,
            scale: 0.95
        })
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/90 backdrop-blur-md"
                    />

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-[110] p-2 text-white/70 hover:text-white transition-colors"
                    >
                        <X className="w-8 h-8" />
                    </button>

                    {/* Content Container */}
                    <div className="relative w-full h-[90vh] md:h-auto md:max-w-6xl md:aspect-video mx-4 z-[105] flex items-center justify-center">

                        {/* Image Carousel */}
                        <div className="relative w-full h-full overflow-hidden rounded-xl shadow-2xl bg-black">

                            {/* Ambient Background (Mobile/Fill effect) */}
                            <AnimatePresence initial={false} mode='popLayout'>
                                <motion.div
                                    key={`bg-${currentIndex}`}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ opacity: { duration: 0.5 } }}
                                    className="absolute inset-0 w-full h-full"
                                >
                                    {/* Mobile Ambient Background Image */}
                                    <div className="md:hidden relative w-full h-full">
                                        <Image
                                            src="/slides/summary-mobile.png"
                                            alt=""
                                            fill
                                            className="object-cover blur-3xl opacity-50 scale-110"
                                            aria-hidden="true"
                                        />
                                    </div>

                                    {/* Desktop Ambient Background Image */}
                                    <div className="hidden md:block relative w-full h-full">
                                        <Image
                                            src="/slides/summary-desktop.png"
                                            alt=""
                                            fill
                                            className="object-cover blur-3xl opacity-50 scale-110"
                                            aria-hidden="true"
                                        />
                                    </div>
                                </motion.div>
                            </AnimatePresence>

                            {/* Main Slide */}
                            <AnimatePresence initial={false} mode='popLayout'>
                                <motion.div
                                    key={currentIndex}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{
                                        opacity: { duration: 0.2 }
                                    }}
                                    className="absolute inset-0 w-full h-full z-10"
                                >
                                    {/* Mobile Image */}
                                    <div className="md:hidden relative w-full h-full">
                                        <Image
                                            src="/slides/summary-mobile.png"
                                            alt="Come funziona SYD - Mobile"
                                            fill
                                            priority
                                            className="object-contain"
                                            sizes="100vw"
                                        />
                                    </div>

                                    {/* Desktop Image */}
                                    <div className="hidden md:block relative w-full h-full">
                                        <Image
                                            src="/slides/summary-desktop.png"
                                            alt="Come funziona SYD - Desktop"
                                            fill
                                            priority
                                            className="object-contain"
                                            sizes="80vw"
                                        />
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
}
