'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

const DESKTOP_SLIDES = [
    '/slides/slide-1.jpg',
    '/slides/slide-2.jpg',
    '/slides/slide-3.jpg',
    '/slides/slide-4.jpg',
    '/slides/slide-5.jpg',
    '/slides/slide-6.jpg',
    '/slides/slide-7.jpg',
    '/slides/slide-8.jpg',
];

interface SlideShowModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SlideShowModal({ isOpen, onClose }: SlideShowModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(0);

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

    const paginate = useCallback((newDirection: number) => {
        setDirection(newDirection);
        setCurrentIndex((prev) => {
            let next = prev + newDirection;
            if (next < 0) next = DESKTOP_SLIDES.length - 1;
            if (next >= DESKTOP_SLIDES.length) next = 0;
            return next;
        });
    }, []);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') paginate(1);
            if (e.key === 'ArrowLeft') paginate(-1);
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, paginate]);

    // Slide variants for animations
    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 1000 : -1000,
            opacity: 0,
            scale: 0.95
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
            scale: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 1000 : -1000,
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
                        className="absolute inset-0 bg-luxury-bg/95 backdrop-blur-md"
                    />

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-[110] p-2 text-luxury-text/70 hover:text-luxury-gold transition-colors"
                    >
                        <X className="w-8 h-8" />
                    </button>

                    {/* Content Container */}
                    <div className="relative w-full h-[90vh] md:w-[90vw] md:h-[90vh] mx-4 z-[105] flex items-center justify-center">

                        {/* Desktop Previous Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); paginate(-1); }}
                            className="hidden md:block absolute -left-16 z-10 p-2 rounded-full bg-luxury-bg/30 border border-luxury-gold/10 hover:bg-luxury-gold/10 text-luxury-text backdrop-blur-sm transition-all hover:scale-110"
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>

                        {/* Image Carousel */}
                        <div className="relative w-full h-full overflow-hidden rounded-xl shadow-2xl bg-black border border-luxury-gold/10">

                            {/* Ambient Background */}
                            <AnimatePresence initial={false} custom={direction} mode='popLayout'>
                                <motion.div
                                    key={`bg-${currentIndex}`}
                                    custom={direction}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ opacity: { duration: 0.5 } }}
                                    className="absolute inset-0 w-full h-full"
                                >
                                    {/* Mobile Ambient Background */}
                                    <div className="md:hidden w-full h-full relative">
                                        <Image
                                            src="/slides/summary-mobile.png"
                                            alt=""
                                            fill
                                            className="object-cover blur-3xl opacity-50 scale-110"
                                            aria-hidden="true"
                                        />
                                    </div>
                                    {/* Desktop Ambient Background (Dynamic) */}
                                    <div className="hidden md:block w-full h-full relative">
                                        <Image
                                            src={DESKTOP_SLIDES[currentIndex]}
                                            alt=""
                                            fill
                                            className="object-cover blur-3xl opacity-30 scale-110"
                                            aria-hidden="true"
                                        />
                                    </div>
                                </motion.div>
                            </AnimatePresence>

                            {/* Main Slide Content */}
                            <AnimatePresence initial={false} custom={direction} mode='popLayout'>
                                <motion.div
                                    key={currentIndex}
                                    custom={direction}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{
                                        x: { type: "spring", stiffness: 300, damping: 30 },
                                        opacity: { duration: 0.2 }
                                    }}
                                    className="absolute inset-0 w-full h-full z-10"
                                >
                                    {/* Mobile Static Slide */}
                                    <div className="md:hidden w-full h-full relative">
                                        <Image
                                            src="/slides/summary-mobile.png"
                                            alt="Come funziona SYD"
                                            fill
                                            priority
                                            className="object-contain"
                                            sizes="100vw"
                                        />
                                    </div>

                                    {/* Desktop Dynamic Carousel */}
                                    <div className="hidden md:block w-full h-full relative">
                                        <Image
                                            src={DESKTOP_SLIDES[currentIndex]}
                                            alt={`Slide ${currentIndex + 1}`}
                                            fill
                                            priority
                                            className="object-contain"
                                            sizes="90vw"
                                        />
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Desktop Next Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); paginate(1); }}
                            className="hidden md:block absolute -right-16 z-10 p-2 rounded-full bg-luxury-bg/30 border border-luxury-gold/10 hover:bg-luxury-gold/10 text-luxury-text backdrop-blur-sm transition-all hover:scale-110"
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>

                        {/* Desktop Dots Indicator */}
                        <div className="hidden md:flex absolute -bottom-10 left-0 right-0 justify-center gap-2">
                            {DESKTOP_SLIDES.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setDirection(idx > currentIndex ? 1 : -1);
                                        setCurrentIndex(idx);
                                    }}
                                    className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex ? 'bg-luxury-gold w-4' : 'bg-luxury-text/30 hover:bg-luxury-gold/50'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
}
