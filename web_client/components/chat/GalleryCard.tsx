import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, Download } from 'lucide-react';

interface GalleryImage {
    url: string;
    name: string;
    metadata?: Record<string, any>;
    type: string;
}

interface GalleryCardProps {
    items: GalleryImage[];
    projectId: string;
}

/**
 * GalleryCard - Visual Grid for Project Images
 * Displays images in a responsive grid with lightbox functionality.
 */
export function GalleryCard({ items, projectId }: GalleryCardProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    if (!items || items.length === 0) {
        return (
            <div className="text-luxury-text/60 text-sm italic">
                Nessuna immagine disponibile
            </div>
        );
    }

    const selectedImage = selectedIndex !== null ? items[selectedIndex] : null;

    return (
        <>
            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-4">
                {items.map((item, idx) => (
                    <motion.div
                        key={item.url}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-luxury-bg/30 border border-luxury-gold/10 hover:border-luxury-gold/30 transition-all"
                        onClick={() => setSelectedIndex(idx)}
                    >
                        <img
                            src={item.url}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <div className="text-white text-xs font-medium truncate">
                                {item.metadata?.room || item.name}
                            </div>
                        </div>

                        {/* Zoom Icon */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-white/20 backdrop-blur-sm rounded-full p-1.5">
                                <ZoomIn className="w-4 h-4 text-white" />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setSelectedIndex(null)}
                    >
                        {/* Close Button */}
                        <button
                            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
                            onClick={() => setSelectedIndex(null)}
                        >
                            <X className="w-6 h-6 text-white" />
                        </button>

                        {/* Navigation */}
                        {items.length > 1 && (
                            <>
                                <button
                                    className="absolute left-4 bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedIndex(selectedIndex! > 0 ? selectedIndex! - 1 : items.length - 1);
                                    }}
                                >
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    className="absolute right-4 bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedIndex(selectedIndex! < items.length - 1 ? selectedIndex! + 1 : 0);
                                    }}
                                >
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </>
                        )}

                        {/* Image */}
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            className="max-w-6xl max-h-[90vh] relative"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                            <img
                                src={selectedImage.url}
                                alt={selectedImage.name}
                                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                            />

                            {/* Info Bar */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
                                <div className="text-white font-medium">{selectedImage.name}</div>
                                {selectedImage.metadata?.room && (
                                    <div className="text-white/70 text-sm mt-1">
                                        {selectedImage.metadata.room}
                                    </div>
                                )}
                            </div>

                            {/* Download Button */}
                            <a
                                href={selectedImage.url}
                                download={selectedImage.name}
                                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                                <Download className="w-5 h-5 text-white" />
                            </a>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
