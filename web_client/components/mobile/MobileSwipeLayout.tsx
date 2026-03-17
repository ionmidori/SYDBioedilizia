"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/dashboard/SidebarProvider';
import { M3Spring } from '@/lib/m3-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MobileSwipeLayoutProps {
    children: React.ReactNode;
}

export const PANES = ['dashboard', 'gallery', 'projects'] as const;
export const PANE_ROUTES = ['/dashboard', '/dashboard/gallery', '/dashboard/projects'] as const;

export const PROJECT_SUBPAGES = ['chat', 'files', 'settings'] as const;
export type ProjectSubpage = (typeof PROJECT_SUBPAGES)[number];

// ─── Helpers (exported for DashboardHeader) ─────────────────────────────────

/** UUID regex for detecting project routes */
const PROJECT_ID_REGEX = /^\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

export function getActiveIndexFromPathname(pathname: string): number {
    // Project routes count as "projects" section
    if (pathname.startsWith('/dashboard/projects') || PROJECT_ID_REGEX.test(pathname)) return 2;
    if (pathname.startsWith('/dashboard/gallery')) return 1;
    return 0; // default: /dashboard
}

/** Extract project ID from pathname, or null if not in a project */
export function getProjectIdFromPathname(pathname: string): string | null {
    const match = pathname.match(PROJECT_ID_REGEX);
    return match ? match[1] : null;
}

/** Get the active project subpage index from pathname + search params */
export function getProjectSubpageIndex(pathname: string, viewParam: string | null): number {
    if (pathname.endsWith('/files')) return 1;
    if (pathname.endsWith('/settings')) return 2;
    if (viewParam === 'files') return 1;
    if (viewParam === 'settings') return 2;
    return 0; // chat (default)
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

    return (
        <div className="flex items-center justify-center gap-1.5 py-1">
            {labels.map((label, i) => (
                <button
                    key={i}
                    onClick={() => onIndexClick?.(i)}
                    className="group/dot relative p-4 -m-4 focus-visible:outline-none transition-transform active:scale-75 touch-manipulation z-50"
                    aria-label={`Vai a ${label}`}
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
                "ml-1.5 font-bold uppercase tracking-wider text-luxury-text/40",
                size === 'small' ? "text-[8px]" : "text-[10px]"
            )}>
                {labels[activeIndex]}
            </span>
        </div>
    );
}

export const MAIN_LABELS = ['Bacheca', 'Galleria', 'Progetti'] as const;
export const SUBPAGE_LABELS = ['Cantiere AI', 'Galleria', 'Settaggi'] as const;

// ─── Main Component ──────────────────────────────────────────────────────────
// Navigation between panes is handled by DashboardHeader dot indicator (PaneIndicator)
// and sidebar on desktop. No swipe gestures — vertical scroll is released to the browser.

export function MobileSwipeLayout({ children }: MobileSwipeLayoutProps) {
    const { isMobile } = useSidebar();

    // Desktop: render children only
    if (!isMobile) return <>{children}</>;

    return (
        <div className="relative h-[100dvh] w-full bg-luxury-bg overflow-x-hidden">
            {children}
        </div>
    );
}
