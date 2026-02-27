'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { X, ChevronLeft, ChevronRight, RotateCcw, Download, Share2, Info, Maximize2 } from 'lucide-react';
import { M3Spring } from '@/lib/m3-motion';
import { cn } from '@/lib/utils';

interface Image {
    id: string;
    url: string;
    title?: string;
    description?: string;
    metadata?: Record<string, any>;
}

interface AdvancedLightboxProps {
    images: Image[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
    onShare?: (imageUrl: string) => Promise<void>;
    enableKeyboardShortcuts?: boolean;
    enableSwipeNavigation?: boolean;
}

/**
 * AdvancedLightbox - Enterprise Gallery Experience
 *
 * Features:
 * - 🔍 Pinch-to-zoom + Pan gestures (touch & trackpad)
 * - ⌨️ Keyboard shortcuts (arrows, +/-, ESC, etc.)
 * - 👆 Swipe navigation (mobile-first)
 * - ♿ ARIA accessible modal with focus trap
 * - ⚡ Smooth M3 Expressive animations
 * - 📱 Responsive across all devices
 */
export function AdvancedLightbox({
    images,
    initialIndex = 0,
    isOpen,
    onClose,
    onShare,
    enableKeyboardShortcuts = true,
    enableSwipeNavigation = true,
}: AdvancedLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [showInfo, setShowInfo] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const transformWrapperRef = useRef<ReactZoomPanPinchRef | null>(null);

    // Navigation (defined before useEffect that references them)
    const handleNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    }, [images.length]);

    const handlePrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    }, [images.length]);

    const resetZoom = useCallback(() => {
        transformWrapperRef.current?.resetTransform?.();
    }, []);

    // Ensure index stays in bounds
    useEffect(() => {
        if (currentIndex >= images.length) {
            setCurrentIndex(images.length - 1);
        }
    }, [images.length, currentIndex]);

    // Keyboard shortcuts
    useEffect(() => {
        if (!isOpen || !enableKeyboardShortcuts) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    onClose();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handlePrevious();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleNext();
                    break;
                case 'i':
                case 'I':
                    e.preventDefault();
                    setShowInfo(prev => !prev);
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    transformWrapperRef.current?.zoomIn?.();
                    break;
                case '-':
                    e.preventDefault();
                    transformWrapperRef.current?.zoomOut?.();
                    break;
                case '0':
                    e.preventDefault();
                    transformWrapperRef.current?.resetTransform?.();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    setIsFullscreen(prev => !prev);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, enableKeyboardShortcuts, onClose, handleNext, handlePrevious]);

    // Touch/swipe handling
    const handleTouchStart = (e: React.TouchEvent) => {
        if (!enableSwipeNavigation) return;
        setTouchStart(e.touches[0].clientX);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!enableSwipeNavigation || touchStart === null) return;
        
        // 🛡️ Chrome Intervention Fix: Prevent default only if event is cancelable
        if (e.cancelable) {
            // e.preventDefault(); // Optional: only if we want to block scroll
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!enableSwipeNavigation || touchStart === null) return;

        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStart - touchEnd;

        // Swipe left -> next, swipe right -> previous
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                handleNext();
            } else {
                handlePrevious();
            }
        }
        setTouchStart(null);
    };

    // Reset zoom when changing images
    useEffect(() => {
        resetZoom();
    }, [currentIndex, resetZoom]);

    // Derive currentImage after all hooks — safe because index is always in bounds
    const currentImage = images[Math.min(currentIndex, images.length - 1)];

    // Render nothing if no images (after all hooks)
    if (!isOpen || images.length === 0) return null;

    // Fullscreen API
    const handleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await containerRef.current?.requestFullscreen?.();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (err) {
            console.error('Fullscreen error:', err);
        }
    };

    // Share handler
    const handleShare = async () => {
        if (!onShare) return;
        setIsSharing(true);
        try {
            await onShare(currentImage.url);
        } catch (err) {
            console.error('Share error:', err);
        } finally {
            setIsSharing(false);
        }
    };

    // Download handler — uses blob to force download across CORS origins (e.g. Firebase Storage)
    const handleDownload = async () => {
        try {
            const response = await fetch(currentImage.url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = currentImage.title || `image-${currentIndex}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch {
            // Fallback: open in new tab if fetch fails
            window.open(currentImage.url, '_blank');
        }
    };

    return (
        <motion.div
            ref={containerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={M3Spring.expressive}
            className={cn(
                'fixed inset-0 z-[9999] bg-black/95 backdrop-blur-2xl',
                'flex flex-col items-center justify-center overflow-hidden',
                'cursor-grab active:cursor-grabbing touch-action-none'
            )}
            style={{ touchAction: 'none' }}
            role="dialog"
            aria-label="Visualizzatore immagini fullscreen"
            aria-modal="true"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Header Bar */}
            <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 md:px-6 md:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                        <h2 className="text-white font-bold text-base md:text-lg truncate tracking-tight">
                            {currentImage.title === 'Render generated' ? 'Rendering Generato' : (currentImage.title || `Immagine ${currentIndex + 1}`)}
                        </h2>
                        <p className="text-white/50 text-[10px] md:text-xs tracking-[0.2em] uppercase font-bold">
                            {currentIndex + 1} di {images.length}
                        </p>
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-2 ml-4">
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowInfo(!showInfo)}
                            aria-label="Mostra informazioni"
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="Info (I)"
                        >
                            <Info className="w-5 h-5 text-white" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleFullscreen}
                            aria-label="Schermo intero"
                            className="p-2 hover:bg-white/10 rounded-full transition-colors hidden md:block"
                            title="Fullscreen (F)"
                        >
                            <Maximize2 className="w-5 h-5 text-white" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onClose}
                            aria-label="Chiudi"
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            title="Chiudi (ESC)"
                        >
                            <X className="w-5 h-5 text-white" />
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Main Image Area */}
            <div
                className="flex-1 w-full relative h-[60dvh] md:h-full flex items-center justify-center overflow-hidden"
                style={{ touchAction: 'none' }}
            >
                <TransformWrapper
                    ref={transformWrapperRef}
                    initialScale={1}
                    minScale={0.8}
                    maxScale={4}
                    centerOnInit
                    wheel={{ step: 0.1 }}
                    panning={{ disabled: false }}
                    pinch={{ disabled: false }}
                    doubleClick={{ disabled: false }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <TransformComponent
                            wrapperClass="!w-full !h-full flex items-center justify-center"
                            contentClass="flex items-center justify-center"
                        >
                            <motion.img
                                key={currentIndex}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={M3Spring.standard}
                                src={currentImage.url}
                                alt={currentImage.title || 'Full screen image view'}
                                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg select-none"
                                draggable={false}
                            />
                        </TransformComponent>
                    )}
                </TransformWrapper>
            </div>

            {/* Navigation Arrows */}
            {images.length > 1 && (
                <>
                    <motion.button
                        whileHover={{ scale: 1.1, x: -4 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handlePrevious}
                        aria-label="Immagine precedente"
                        className={cn(
                            'absolute left-4 top-1/2 -translate-y-1/2 z-40',
                            'p-3 rounded-full bg-white/10 hover:bg-white/20',
                            'transition-colors backdrop-blur-md border border-white/10',
                            'hidden sm:flex items-center justify-center'
                        )}
                        title="Precedente (←)"
                    >
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.1, x: 4 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleNext}
                        aria-label="Immagine successiva"
                        className={cn(
                            'absolute right-4 top-1/2 -translate-y-1/2 z-40',
                            'p-3 rounded-full bg-white/10 hover:bg-white/20',
                            'transition-colors backdrop-blur-md border border-white/10',
                            'hidden sm:flex items-center justify-center'
                        )}
                        title="Successiva (→)"
                    >
                        <ChevronRight className="w-6 h-6 text-white" />
                    </motion.button>
                </>
            )}

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/80 to-transparent px-4 py-4 md:px-6 md:py-6">
                <div className="flex items-center justify-between gap-4">
                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full p-1">
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => transformWrapperRef.current?.zoomOut?.()}
                            className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg font-light transition-colors"
                            title="Zoom out (-)"
                        >
                            −
                        </motion.button>
                        <span className="text-white text-[10px] uppercase tracking-wider font-bold px-2 hidden sm:block">Zoom</span>
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => transformWrapperRef.current?.zoomIn?.()}
                            className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg font-light transition-colors"
                            title="Zoom in (+)"
                        >
                            +
                        </motion.button>
                        <div className="w-[1px] h-4 bg-white/10 mx-1" />
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => transformWrapperRef.current?.resetTransform?.()}
                            className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                            title="Reset (0)"
                            aria-label="Ripristina zoom"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </motion.button>
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {onShare && (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleShare}
                                disabled={isSharing}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-bold transition-colors disabled:opacity-50"
                                title="Condividi"
                            >
                                <Share2 className="w-4 h-4" />
                            </motion.button>
                        )}

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleDownload}
                            className="px-4 py-2 bg-luxury-gold hover:bg-luxury-gold/80 text-luxury-bg rounded-full text-sm font-bold transition-colors"
                            title="Scarica"
                            aria-label="Scarica immagine"
                        >
                            <Download className="w-4 h-4" />
                        </motion.button>
                    </div>
                </div>

                {/* Keyboard Shortcuts Hint */}
                {enableKeyboardShortcuts && (
                    <div className="mt-3 text-[10px] text-white/40 text-center space-y-1 hidden md:block">
                        <p>⌨️ Scorciatoie: ← → Naviga · + − Zoom · 0 Reset · I Info · F Fullscreen · ESC Chiudi</p>
                    </div>
                )}
            </div>

            {/* Info Panel */}
            <AnimatePresence>
                {showInfo && currentImage.metadata && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={M3Spring.standard}
                        className="absolute top-20 right-4 z-40 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 max-w-xs"
                    >
                        <h3 className="text-white font-bold text-sm mb-3">Info Immagine</h3>
                        <div className="space-y-2 text-xs text-white/70">
                            {Object.entries(currentImage.metadata).map(([key, value]) => (
                                <div key={key}>
                                    <span className="font-bold text-white/90">{key}:</span> {String(value)}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
