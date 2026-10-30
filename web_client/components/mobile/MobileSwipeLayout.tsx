"use client";

import React from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/dashboard/SidebarProvider';
import { M3Spring } from '@/lib/m3-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MobileSwipeLayoutProps {
    children: React.ReactNode;
}

// The sections of the dashboard (Phase 139): the house, its gallery, its quotes.
export const PANE_ROUTES = ['/dashboard', '/dashboard/gallery', '/dashboard/quotes'] as const;
export const MAIN_LABELS = ['Casa', 'Galleria', 'Preventivi'] as const;

// ─── Helpers (exported for DashboardHeader) ─────────────────────────────────

export function getActiveIndexFromPathname(pathname: string): number {
    if (pathname.startsWith('/dashboard/quotes')) return 2;
    if (pathname.startsWith('/dashboard/gallery')) return 1;
    return 0; // default: /dashboard
}

// ─── Dot Indicator (exported for DashboardHeader) ───────────────────────────

interface PaneIndicatorProps {
    activeIndex: number;
    labels: readonly string[];
    size?: 'normal' | 'small';
    onIndexClick?: (index: number) => void;
}

export function PaneIndicator({ activeIndex, labels, size = 'normal', onIndexClick }: PaneIndicatorProps) {
    const dotWidth = size === 'small' ? 14 : 20;
    const dotHeight = size === 'small' ? 4 : 6;
    const inactiveDot = size === 'small' ? 4 : 6;

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        // Swipe left (next)
        if (info.offset.x < -40) {
            const nextIndex = Math.min(activeIndex + 1, labels.length - 1);
            if (nextIndex !== activeIndex) onIndexClick?.(nextIndex);
        }
        // Swipe right (prev)
        else if (info.offset.x > 40) {
            const prevIndex = Math.max(activeIndex - 1, 0);
            if (prevIndex !== activeIndex) onIndexClick?.(prevIndex);
        }
    };

    return (
        <motion.div 
            className="flex items-center justify-center py-1 px-4 cursor-grab active:cursor-grabbing"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
        >
            {labels.map((label, i) => (
                // A 24px target per dot, side by side: padded targets overlapping
                // their neighbours sent a tap on one dot to the next.
                <button
                    key={i}
                    type="button"
                    onClick={() => onIndexClick?.(i)}
                    className="group/dot relative flex items-center justify-center min-w-6 h-6 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/60 transition-transform active:scale-75 touch-manipulation"
                    aria-label={`Vai a ${label}`}
                    aria-current={i === activeIndex ? 'page' : undefined}
                >
                    <motion.div
                        className={cn(
                            "rounded-full transition-colors duration-200",
                            i === activeIndex ? "bg-luxury-gold" : "bg-luxury-text/20 group-hover/dot:bg-luxury-text/40"
                        )}
                        animate={{
                            width: i === activeIndex ? dotWidth : inactiveDot,
                            height: dotHeight,
                        }}
                        transition={M3Spring.expressive}
                    />
                </button>
            ))}
            <span className={cn(
                "ml-1.5 font-bold uppercase tracking-wider text-luxury-text/40 select-none",
                size === 'small' ? "text-[8px]" : "text-[10px]"
            )}>
                {labels[activeIndex]}
            </span>
        </motion.div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
// Navigation between panes is handled by DashboardHeader dot indicator (PaneIndicator)
// and sidebar on desktop. No swipe gestures — vertical scroll is released to the browser.

export function MobileSwipeLayout({ children }: MobileSwipeLayoutProps) {
    const { isMobile } = useSidebar();

    // Desktop: render children only
    if (!isMobile) return <>{children}</>;

    return (
        <div className="relative min-h-[100dvh] w-full bg-luxury-bg overflow-x-hidden">
            {children}
        </div>
    );
}
