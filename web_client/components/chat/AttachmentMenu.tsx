"use client";

import { type ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Video, Image as ImageIcon, FileText, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachmentMenuProps {
    isOpen: boolean;
    onClose: () => void;
    /** Apre la Photo Library / Galleria foto (image/* senza capture) */
    onGalleryPhotoClick: () => void;
    /** Apre la fotocamera direttamente in modalità foto */
    onCameraClick: () => void;
    /** Apre la fotocamera in modalità video */
    onVideoClick: () => void;
    /** Apre il file manager per selezionare un PDF */
    onDocumentClick: () => void;
    /** Apre il picker di sistema con Drive/iCloud come sorgenti (image + video + pdf, no capture) */
    onCloudClick: () => void;
}

interface MenuOption {
    icon: ReactNode;
    label: string;
    description: string;
    onClick: () => void;
}

export function AttachmentMenu({
    isOpen,
    onClose,
    onGalleryPhotoClick,
    onCameraClick,
    onVideoClick,
    onDocumentClick,
    onCloudClick,
}: AttachmentMenuProps) {
    // Chiudi con ESC
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const menuVariants = {
        hidden: {
            opacity: 0,
            scale: 0.85,
            y: 8,
            transformOrigin: 'bottom left',
        },
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { type: 'spring' as const, stiffness: 420, damping: 28 },
        },
        exit: {
            opacity: 0,
            scale: 0.85,
            y: 8,
            transition: { duration: 0.12 },
        },
    };

    const options: MenuOption[] = [
        {
            icon: <ImageIcon className="w-4 h-4" />,
            label: 'Galleria foto',
            description: 'Scegli dalla libreria del tuo telefono',
            onClick: () => { onClose(); onGalleryPhotoClick(); },
        },
        {
            icon: <Camera className="w-4 h-4" />,
            label: 'Scatta foto',
            description: 'Apri la fotocamera',
            onClick: () => { onClose(); onCameraClick(); },
        },
        {
            icon: <Video className="w-4 h-4" />,
            label: 'Registra video',
            description: 'Fino a 50 MB',
            onClick: () => { onClose(); onVideoClick(); },
        },
        {
            icon: <FileText className="w-4 h-4" />,
            label: 'Documento PDF',
            description: 'Planimetria o preventivo',
            onClick: () => { onClose(); onDocumentClick(); },
        },
        {
            icon: <Cloud className="w-4 h-4" />,
            label: 'Google Drive / iCloud',
            description: 'Foto, video o PDF dal cloud',
            onClick: () => { onClose(); onCloudClick(); },
        },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    variants={menuVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className={cn(
                        'absolute bottom-full left-0 mb-3 z-50 min-w-[260px]',
                        'bg-luxury-bg/96 backdrop-blur-2xl',
                        'border border-luxury-gold/20 shadow-premium',
                        'rounded-2xl overflow-hidden flex flex-col py-1'
                    )}
                    role="menu"
                    aria-orientation="vertical"
                    aria-label="Allega file"
                >
                    {/* Header */}
                    <div className="px-4 py-2 text-[10px] font-semibold text-luxury-gold/50 uppercase tracking-widest border-b border-luxury-gold/10 mb-1">
                        Allega
                    </div>

                    {options.map((opt, i) => (
                        <motion.button
                            key={opt.label}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{
                                opacity: 1,
                                x: 0,
                                transition: { delay: 0.04 * i, duration: 0.18 },
                            }}
                            onClick={opt.onClick}
                            className="flex items-center gap-3 px-4 py-3 text-left hover:bg-luxury-gold/10 active:bg-luxury-gold/20 transition-colors group w-full"
                            role="menuitem"
                        >
                            <div className="p-2 bg-luxury-gold/10 rounded-full text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-bg transition-colors shrink-0">
                                {opt.icon}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium text-luxury-text leading-tight">
                                    {opt.label}
                                </span>
                                <span className="text-[10px] text-luxury-text/45 leading-tight mt-0.5 truncate">
                                    {opt.description}
                                </span>
                            </div>
                        </motion.button>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
