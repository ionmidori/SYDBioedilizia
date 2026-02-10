"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { ProjectList } from '@/components/chat/ProjectList';
import { GlobalGalleryContent } from '@/components/dashboard/GlobalGalleryContent';
import { Menu, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

interface MobileSwipeLayoutProps {
    children: React.ReactNode;
}

type Pane = 'projects' | 'dashboard' | 'gallery';

export function MobileSwipeLayout({ children }: MobileSwipeLayoutProps) {
    const [activePane, setActivePane] = useState<Pane>('dashboard');
    const containerRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile for conditional drag
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Reset to Dashboard when navigating (e.g. selecting a project)
    useEffect(() => {
        setActivePane('dashboard');
    }, [pathname]);

    // Drag Constraints
    const x = useMotionValue(0);
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 375;

    // Calculate offsets
    // dashboard (center) = 0
    // projects (left) = x > 0
    // gallery (right) = x < 0

    // We want to snap to:
    // 0 (Dashboard)
    // +screenWidth (Projects)
    // -screenWidth (Gallery)

    const handleDragEnd = (event: any, info: PanInfo) => {
        const threshold = screenWidth / 3;
        const velocity = info.velocity.x;

        if (activePane === 'dashboard') {
            if (info.offset.x > threshold || velocity > 500) {
                setActivePane('projects');
            } else if (info.offset.x < -threshold || velocity < -500) {
                setActivePane('gallery');
            }
        } else if (activePane === 'projects') {
            if (info.offset.x < -threshold || velocity < -500) {
                setActivePane('dashboard');
            }
        } else if (activePane === 'gallery') {
            if (info.offset.x > threshold || velocity > 500) {
                setActivePane('dashboard');
            }
        }
    };

    // Animation Variants
    // Mobile: Apply simple transforms
    // Desktop: No transforms
    const contentVariants = {
        mobile: {
            x: activePane === 'projects' ? '85%' : activePane === 'gallery' ? '-100%' : 0,
            scale: activePane !== 'dashboard' ? 0.95 : 1,
            opacity: activePane !== 'dashboard' ? 0.8 : 1,
            borderRadius: activePane !== 'dashboard' ? '20px' : '0px',
            overflow: 'hidden'
        },
        desktop: {
            x: 0,
            scale: 1,
            opacity: 1,
            borderRadius: 0,
            overflow: 'visible'
        }
    };

    // If not mobile (server or desktop), fallback to simple render to avoid hydration mismatch issues initially
    // But we render the structure anyway, just hidden/disabled

    return (
        <div className="relative h-full w-full bg-luxury-bg/5" ref={containerRef}>
            {/* 1. Project Pane (Left) - Mobile Only */}
            <motion.div
                className="md:hidden absolute inset-y-0 left-0 w-full z-30 pointer-events-none data-[active=true]:pointer-events-auto"
                data-active={activePane === 'projects'}
                initial={{ x: '-100%' }}
                animate={{ x: activePane === 'projects' ? 0 : '-100%' }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
                <div className="h-full w-full bg-luxury-bg">
                    <ProjectList
                        onProjectSelect={() => setActivePane('dashboard')}
                    />
                </div>
            </motion.div>

            {/* 2. Global Gallery Pane (Right) - Mobile Only */}
            <motion.div
                className="md:hidden absolute inset-y-0 right-0 w-full z-30 pointer-events-none data-[active=true]:pointer-events-auto"
                data-active={activePane === 'gallery'}
                initial={{ x: '100%' }}
                animate={{ x: activePane === 'gallery' ? 0 : '100%' }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
                <div className="h-full w-full bg-luxury-bg">
                    <GlobalGalleryContent />
                </div>
            </motion.div>

            {/* 3. Dashboard (Center) - Swipeable Handle on Mobile */}
            <motion.div
                className="h-full w-full bg-luxury-bg flex flex-col shadow-2xl md:shadow-none"
                animate={isMobile ? contentVariants.mobile : contentVariants.desktop}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                drag={isMobile ? "x" : false}
                dragConstraints={{ left: -screenWidth, right: screenWidth }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                style={{ touchAction: 'pan-y' }} // Allow vertical scroll, block horizontal for swipe
            >
                {/* Mobile Header indicator/hint */}
                {isMobile && activePane === 'dashboard' && (
                    <div className="absolute top-0 inset-x-0 h-1 z-50 flex justify-between px-2 pt-2 opacity-50 pointer-events-none">
                        <div className="bg-luxury-gold/20 w-1 h-8 rounded-full" /> {/* Hint Left */}
                        <div className="bg-luxury-gold/20 w-1 h-8 rounded-full" /> {/* Hint Right */}
                    </div>
                )}

                {children}

                {/* Overlay to catch clicks when pushed to side (to close) - Mobile Only */}
                {isMobile && activePane !== 'dashboard' && (
                    <div
                        className="absolute inset-0 z-50 bg-black/20 backdrop-blur-[1px]"
                        onClick={() => setActivePane('dashboard')}
                    />
                )}
            </motion.div>
        </div>
    );
}
