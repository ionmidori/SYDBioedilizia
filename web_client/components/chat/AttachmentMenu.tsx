"use client";

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Video, Image, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachmentMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onCameraClick: () => void;
    onVideoClick: () => void;
    onGalleryClick: () => void;
}

export function AttachmentMenu({
    isOpen,
    onClose,
    onCameraClick,
    onVideoClick,
    onGalleryClick,
}: AttachmentMenuProps) {
    // Handle ESC key to close menu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    // Motion variants for spring animation
    const menuVariants = {
        hidden: { 
            opacity: 0, 
            scale: 0.8, 
            y: 10,
            transformOrigin: "bottom left"
        },
        visible: { 
            opacity: 1, 
            scale: 1, 
            y: 0,
            transition: { 
                type: "spring" as const, 
                stiffness: 400, 
                damping: 25 
            }
        },
        exit: { 
            opacity: 0, 
            scale: 0.8, 
            y: 10,
            transition: { 
                duration: 0.15 
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, x: -10 },
        visible: (i: number) => ({
            opacity: 1,
            x: 0,
            transition: { delay: 0.05 * i, duration: 0.2 }
        })
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Invisible Overlay for click-outside */}
                    <div 
                        className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" 
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        aria-hidden="true"
                    />

                    {/* Menu Dropdown */}
                    <motion.div
                        variants={menuVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className={cn(
                            "absolute bottom-full left-0 mb-3 z-50 min-w-[240px]",
                            "bg-luxury-bg/95 backdrop-blur-xl",
                            "border border-luxury-gold/20 shadow-premium",
                            "rounded-2xl overflow-hidden flex flex-col py-1"
                        )}
                        role="menu"
                        aria-orientation="vertical"
                        aria-label="Opzioni allegati"
                    >
                        {/* Header decorativo (opzionale) */}
                        <div className="px-4 py-2 text-xs font-medium text-luxury-gold/60 uppercase tracking-wider border-b border-luxury-gold/10 mb-1">
                            Allega
                        </div>

                        {/* Option 1: Scatta Foto */}
                        <motion.button
                            custom={0}
                            variants={itemVariants}
                            onClick={() => {
                                onClose();
                                onCameraClick();
                            }}
                            className="flex items-center gap-3 px-4 py-3 text-left hover:bg-luxury-gold/10 active:bg-luxury-gold/20 transition-colors group"
                            role="menuitem"
                        >
                            <div className="p-2 bg-luxury-gold/10 rounded-full text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-bg transition-colors">
                                <Camera className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-luxury-text">Scatta Foto</span>
                                <span className="text-[10px] text-luxury-text/50 leading-tight">Fotocamera posteriore</span>
                            </div>
                        </motion.button>

                        {/* Option 2: Registra Video */}
                        <motion.button
                            custom={1}
                            variants={itemVariants}
                            onClick={() => {
                                onClose();
                                onVideoClick();
                            }}
                            className="flex items-center gap-3 px-4 py-3 text-left hover:bg-luxury-gold/10 active:bg-luxury-gold/20 transition-colors group"
                            role="menuitem"
                        >
                            <div className="p-2 bg-luxury-gold/10 rounded-full text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-bg transition-colors">
                                <Video className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-luxury-text">Registra Video</span>
                                <span className="text-[10px] text-luxury-text/50 leading-tight">Video rapido</span>
                            </div>
                        </motion.button>

                        {/* Option 3: Galleria / Documenti */}
                        <motion.button
                            custom={2}
                            variants={itemVariants}
                            onClick={() => {
                                onClose();
                                onGalleryClick();
                            }}
                            className="flex items-center gap-3 px-4 py-3 text-left hover:bg-luxury-gold/10 active:bg-luxury-gold/20 transition-colors group"
                            role="menuitem"
                        >
                            <div className="p-2 bg-luxury-gold/10 rounded-full text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-bg transition-colors">
                                <Image className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-luxury-text">Galleria</span>
                                <span className="text-[10px] text-luxury-text/50 leading-tight">Foto, video o documenti</span>
                            </div>
                        </motion.button>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
