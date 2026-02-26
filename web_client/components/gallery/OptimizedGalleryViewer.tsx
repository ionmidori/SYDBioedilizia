'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { AdvancedLightbox } from './AdvancedLightbox';
import { VirtualizedGalleryGrid } from './VirtualizedGalleryGrid';
import { motion } from 'framer-motion';
import { M3Spring } from '@/lib/m3-motion';

export interface GalleryImage {
    id: string;
    url: string;
    thumbnail?: string;
    title?: string;
    description?: string;
    type: 'image' | 'render' | 'video' | 'quote';
    metadata?: Record<string, any>;
}

interface OptimizedGalleryViewerProps {
    images: GalleryImage[];
    title?: string;
    subtitle?: string;
    enableVirtualization?: boolean;
    onImageClick?: (image: GalleryImage, index: number) => void;
}

/**
 * OptimizedGalleryViewer - Complete gallery experience
 *
 * Combines:
 * - VirtualizedGalleryGrid for responsive, performant grid display
 * - AdvancedLightbox for rich fullscreen experience
 * - Keyboard shortcuts, swipe navigation, pinch-to-zoom
 * - Mobile-optimized touch interactions
 */
export function OptimizedGalleryViewer({
    images,
    title = 'Galleria',
    subtitle,
    enableVirtualization = true,
    onImageClick,
}: OptimizedGalleryViewerProps) {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    // Convert quote-type items to proper display format
    const galleryImages = useMemo(() => {
        return images.map((img) => ({
            ...img,
            type: img.type as 'image' | 'render' | 'video' | 'quote',
        }));
    }, [images]);

    const handleImageClick = useCallback((image: GalleryImage, index: number) => {
        setSelectedImageIndex(index);
        setIsLightboxOpen(true);
        onImageClick?.(image, index);
    }, [onImageClick]);

    const handleShareImage = useCallback(async (imageUrl: string) => {
        if (navigator.share) {
            try {
                const blob = await fetch(imageUrl).then(r => r.blob());
                const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
                await navigator.share({
                    title: 'Rendering',
                    text: 'Guarda questo rendering',
                    files: [file],
                });
            } catch (err) {
                console.error('Share error:', err);
            }
        }
    }, []);

    if (galleryImages.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={M3Spring.standard}
                className="flex flex-col items-center justify-center py-24 text-center border border-luxury-gold/10 rounded-3xl bg-luxury-bg/30 p-8"
            >
                <div className="p-6 bg-luxury-gold/10 rounded-2xl mb-4 inline-block">
                    <svg className="w-16 h-16 text-luxury-gold/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-luxury-text/60 mb-2">Nessun File</h3>
                <p className="text-sm md:text-base text-luxury-text/40 max-w-md">
                    I tuoi file generati dalla conversazione appariranno qui.
                </p>
            </motion.div>
        );
    }

    return (
        <>
            {/* Gallery Grid */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={M3Spring.standard}
                className="w-full h-full flex flex-col"
            >
                {/* Header */}
                {title && (
                    <div className="mb-6">
                        <h2 className="text-2xl md:text-3xl font-bold text-luxury-text font-serif">
                            {title}
                            <span className="text-luxury-gold ml-2">({galleryImages.length})</span>
                        </h2>
                        {subtitle && (
                            <p className="text-luxury-text/60 text-sm md:text-base mt-2">{subtitle}</p>
                        )}
                    </div>
                )}

                {/* Virtualized Grid */}
                <div className="flex-1 min-h-[500px] w-full">
                    {enableVirtualization ? (
                        <VirtualizedGalleryGrid
                            items={galleryImages}
                            onItemClick={handleImageClick}
                            gap={16}
                        />
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {galleryImages.map((image, index) => (
                                <motion.div
                                    key={image.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={M3Spring.standard}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleImageClick(image, index)}
                                    className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group bg-luxury-bg/30 border border-luxury-gold/10 hover:border-luxury-gold/30 transition-all"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Apri ${image.title || 'immagine'}`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleImageClick(image, index);
                                    }}
                                >
                                    {(image.type === 'image' || image.type === 'render') ? (
                                        <img
                                            src={image.thumbnail || image.url}
                                            alt={image.title || ''}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-luxury-bg via-luxury-bg/80 to-luxury-bg/60">
                                            <span className="text-luxury-gold/60 text-xs font-bold uppercase tracking-widest">
                                                {image.type === 'quote' ? 'PDF' : image.type.toUpperCase()}
                                            </span>
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                                        <div className="text-white text-xs font-bold truncate">
                                            {image.title || `${image.type} ${index + 1}`}
                                        </div>
                                    </div>

                                    <div className="absolute top-2 right-2 px-2 py-1 bg-luxury-gold/20 text-luxury-gold text-[8px] font-bold uppercase tracking-wider rounded-full backdrop-blur-sm border border-luxury-gold/30">
                                        {image.type === 'quote' ? 'PDF' : image.type.substring(0, 3).toUpperCase()}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Advanced Lightbox */}
            <AdvancedLightbox
                images={galleryImages}
                initialIndex={selectedImageIndex}
                isOpen={isLightboxOpen}
                onClose={() => setIsLightboxOpen(false)}
                onShare={handleShareImage}
                enableKeyboardShortcuts={true}
                enableSwipeNavigation={true}
            />
        </>
    );
}
