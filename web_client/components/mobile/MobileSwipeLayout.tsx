"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ProjectList } from '@/components/chat/ProjectList';
import { GlobalGalleryContent } from '@/components/dashboard/GlobalGalleryContent';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/dashboard/SidebarProvider';

interface MobileSwipeLayoutProps {
    children: React.ReactNode;
}

type Pane = 'projects' | 'dashboard' | 'gallery';

export function MobileSwipeLayout({ children }: MobileSwipeLayoutProps) {
    const [activePane, setActivePane] = useState<Pane>('dashboard');
    const containerRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const { isMobile } = useSidebar();

    // Reset to Dashboard when navigating
    useEffect(() => {
        setActivePane('dashboard');
    }, [pathname]);

    // Gestore dello Swipe sulla Dashboard centrale
    // Se trascini verso destra (x > 50) -> Apri Progetti
    // Se trascini verso sinistra (x < -50) -> Apri Galleria
    const handleDashboardDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (!isMobile) return;
        const swipeThreshold = 50;

        if (info.offset.x > swipeThreshold) {
            setActivePane('projects');
        } else if (info.offset.x < -swipeThreshold) {
            setActivePane('gallery');
        }
    };

    // Varianti per le animazioni a tutto schermo (Overlay puro)
    const overlayVariants = {
        hiddenLeft: { x: '-100%', opacity: 1 },  // Progetti nascosto a sinistra
        hiddenRight: { x: '100%', opacity: 1 },  // Galleria nascosta a destra
        visible: { x: '0%', opacity: 1 },        // Visibile al centro
        exitLeft: { x: '-100%', opacity: 1 },    // Esce tornando a sinistra
        exitRight: { x: '100%', opacity: 1 }     // Esce tornando a destra
    };

    if (!isMobile) return <>{children}</>;

    return (
        <div className="relative h-screen w-full bg-luxury-bg overflow-hidden" ref={containerRef}>

            <motion.div
                className="absolute inset-0 z-0 h-full w-full bg-luxury-bg"
                drag={activePane === 'dashboard' ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.05}
                onDragEnd={handleDashboardDragEnd}
            >
                {children}
            </motion.div>

            {/* 2. Projects Overlay (Left Side) */}
            {/* Compare da sinistra e copre tutto. Swipe verso sinistra per chiudere. */}
            <AnimatePresence>
                {isMobile && activePane === 'projects' && (
                    <motion.div
                        key="projects-pane"
                        className="absolute inset-0 z-50 h-full w-full bg-luxury-bg shadow-2xl"
                        initial="hiddenLeft"
                        animate="visible"
                        exit="exitLeft"
                        variants={overlayVariants}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }} // Anche qui, usiamo il drag solo come trigger
                        onDragEnd={(e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                            // Swipe verso sinistra (negativo) per chiudere
                            if (info.offset.x < -50) setActivePane('dashboard');
                        }}
                    >
                        <div className="relative h-full w-full flex flex-col">
                            {/* Header semplice per indicare dove siamo */}
                            <div className="h-14 flex items-center justify-between px-4 border-b border-luxury-gold/10 bg-luxury-bg/95 backdrop-blur">
                                <span className="font-serif text-lg text-luxury-gold">I Miei Progetti</span>
                                <button
                                    onClick={() => setActivePane('dashboard')}
                                    className="p-2 hover:bg-luxury-gold/10 rounded-full text-luxury-text/60"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden bg-luxury-bg">
                                <ProjectList onProjectSelect={() => setActivePane('dashboard')} />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3. Global Gallery Overlay (Right Side) */}
            {/* Compare da destra e copre tutto. Swipe verso destra per chiudere. */}
            <AnimatePresence>
                {isMobile && activePane === 'gallery' && (
                    <motion.div
                        key="gallery-pane"
                        className="absolute inset-0 z-50 h-full w-full bg-luxury-bg shadow-2xl"
                        initial="hiddenRight"
                        animate="visible"
                        exit="exitRight"
                        variants={overlayVariants}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        onDragEnd={(e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                            // Swipe verso destra (positivo) per chiudere
                            if (info.offset.x > 50) setActivePane('dashboard');
                        }}
                    >
                        <div className="relative h-full w-full flex flex-col">
                            <div className="h-14 flex items-center justify-between px-4 border-b border-luxury-gold/10 bg-luxury-bg/95 backdrop-blur">
                                <span className="font-serif text-lg text-luxury-gold">Galleria Globale</span>
                                <button
                                    onClick={() => setActivePane('dashboard')}
                                    className="p-2 hover:bg-luxury-gold/10 rounded-full text-luxury-text/60"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden bg-luxury-bg">
                                <GlobalGalleryContent />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Overlay scuro di sicurezza (opzionale, ma aiuta il focus) */}
            <AnimatePresence>
                {isMobile && activePane !== 'dashboard' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                        style={{ pointerEvents: 'none' }} // Lasciamo passare i click, è solo visivo sotto il pannello attivo
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
