'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { M3Spring } from '@/lib/m3-motion';

interface GalleryItem {
    id: string;
    url: string;
    thumbnail?: string;
    title?: string;
    type: 'image' | 'render' | 'video' | 'quote';
}

interface VirtualizedGalleryGridProps {
    items: GalleryItem[];
    onItemClick: (item: GalleryItem, index: number) => void;
    columnCount?: number;
    gap?: number;
    itemAspectRatio?: number;
}

/**
 * VirtualizedGalleryGrid - High-performance grid for 100+ images
 *
 * Uses react-window for:
 * - 📱 Responsive columns (auto-calculated)
 * - ⚡ Virtual scrolling (only renders visible items)
 * - 🎨 Smooth transitions and hover effects
 * - ♿ Keyboard navigation support
 */
export function VirtualizedGalleryGrid({
    items,
    onItemClick,
    columnCount: defaultColumnCount,
    gap = 16,
    itemAspectRatio = 1,
}: VirtualizedGalleryGridProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateDimensions = () => {
            setDimensions({
                width: container.clientWidth,
                height: container.clientHeight,
            });
        };

        updateDimensions();
        const observer = new ResizeObserver(updateDimensions);
        observer.observe(container);

        return () => observer.disconnect();
    }, []);

    // Item cell renderer
    const Cell = useCallback(
        ({ columnIndex, rowIndex, style }: any) => {
            const itemIndex = rowIndex * (defaultColumnCount || 3) + columnIndex;
            const item = items[itemIndex];

            if (!item) return null;

            return (
                <div style={style} className="flex items-center justify-center p-[8px]">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={M3Spring.standard}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onItemClick(item, itemIndex)}
                        onMouseEnter={() => setHoveredId(item.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className="relative w-full aspect-square rounded-2xl overflow-hidden cursor-pointer group bg-luxury-bg/30 border border-luxury-gold/10 hover:border-luxury-gold/30 transition-all duration-300"
                        role="button"
                        tabIndex={0}
                        aria-label={`Apri ${item.title || 'immagine'}`}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onItemClick(item, itemIndex);
                        }}
                    >
                        {/* Image or Placeholder */}
                        {(item.type === 'image' || item.type === 'render') ? (
                            <img
                                src={item.thumbnail || item.url}
                                alt={item.title || ''}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 select-none"
                                loading="lazy"
                                decoding="async"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-luxury-bg via-luxury-bg/80 to-luxury-bg/60">
                                <span className="text-luxury-gold/60 text-xs font-bold uppercase tracking-widest">
                                    {item.type === 'quote' ? 'PDF' : item.type.toUpperCase()}
                                </span>
                            </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                            <div className="text-white text-xs font-bold truncate">
                                {item.title || `${item.type} ${itemIndex + 1}`}
                            </div>
                        </div>

                        {/* Type Badge */}
                        <div className="absolute top-2 right-2 px-2 py-1 bg-luxury-gold/20 text-luxury-gold text-[8px] font-bold uppercase tracking-wider rounded-full backdrop-blur-sm border border-luxury-gold/30">
                            {item.type === 'quote' ? 'PDF' : item.type.substring(0, 3).toUpperCase()}
                        </div>

                        {/* Hover Focus Ring */}
                        {hoveredId === item.id && (
                            <motion.div
                                layoutId="focus-ring"
                                className="absolute inset-0 border-2 border-luxury-gold/50 rounded-2xl pointer-events-none"
                                transition={M3Spring.expressive}
                            />
                        )}
                    </motion.div>
                </div>
            );
        },
        [items, defaultColumnCount, onItemClick, hoveredId]
    );

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center border border-luxury-gold/10 rounded-3xl bg-luxury-bg/30 p-12">
                <div className="p-6 bg-luxury-gold/10 rounded-2xl mb-4 inline-block">
                    <svg className="w-12 h-12 text-luxury-gold/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold text-luxury-text/60 mb-2">Nessun File</h3>
                <p className="text-sm text-luxury-text/40">I tuoi file appariranno qui</p>
            </div>
        );
    }

    if (dimensions.width === 0) {
        return <div ref={containerRef} className="w-full" style={{ minHeight: 400 }} />;
    }

    // Auto-calculate columns based on width
    const calculatedColumns = Math.max(2, Math.floor((dimensions.width - gap * 2) / (200 + gap)));
    const columnCount = defaultColumnCount || calculatedColumns;
    const itemSize = (dimensions.width - gap * (columnCount + 1)) / columnCount;
    const rowCount = Math.ceil(items.length / columnCount);

    // Effective height: always at least 400px to prevent height=0 blocking pointer events
    const effectiveHeight = Math.max(dimensions.height, 400);

    return (
        <div ref={containerRef} className="w-full" style={{ minHeight: 400 }} data-no-swipe>
            {dimensions.width > 0 && (
                <Grid
                    columnCount={columnCount}
                    columnWidth={itemSize + gap}
                    height={effectiveHeight}
                    rowCount={rowCount}
                    rowHeight={itemSize + gap}
                    width={dimensions.width}
                >
                    {Cell}
                </Grid>
            )}
        </div>
    );
}
