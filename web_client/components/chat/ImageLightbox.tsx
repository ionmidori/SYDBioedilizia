import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Send } from 'lucide-react';

interface ImageLightboxProps {
    imageUrl: string | null;
    onClose: () => void;
}

/**
 * Image lightbox modal for fullscreen image preview
 * Extracted from ChatWidget.tsx (lines 587-600)
 */
export function ImageLightbox({ imageUrl, onClose }: ImageLightboxProps) {
    return (
        <AnimatePresence>
            {imageUrl && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
                >
                    <div
                        className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center"
                        onClick={e => e.stopPropagation()}
                    >
                        <motion.img
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            src={imageUrl}
                            alt="Full preview"
                            className="max-w-full max-h-[80vh] rounded-lg shadow-2xl border border-white/10"
                        />
                        <div className="mt-4 flex gap-4">
                            <Button
                                onClick={onClose}
                                variant="outline"
                                className="border-white/20 text-white hover:bg-white/10"
                            >
                                <X className="w-4 h-4 mr-2" />
                                Chiudi
                            </Button>
                            <a
                                href={imageUrl}
                                download={`renovation-ai-vision-${Date.now()}.png`}
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2"
                            >
                                <Send className="w-4 h-4 mr-2 rotate-180" />
                                Scarica HD
                            </a>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
