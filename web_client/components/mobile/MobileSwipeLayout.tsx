"use client";

import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/dashboard/SidebarProvider';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { M3Spring } from '@/lib/m3-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MobileSwipeLayoutProps {
    children: React.ReactNode;
}

const PANES = ['projects', 'dashboard', 'gallery'] as const;
const PANE_ROUTES = ['/dashboard/projects', '/dashboard', '/dashboard/gallery'] as const;

const PROJECT_SUBPAGES = ['chat', 'files', 'settings'] as const;
export type ProjectSubpage = (typeof PROJECT_SUBPAGES)[number];

// ─── Helpers (exported for DashboardHeader) ─────────────────────────────────

/** UUID regex for detecting project routes */
const PROJECT_ID_REGEX = /^\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

export function getActiveIndexFromPathname(pathname: string): number {
    // Project routes count as "projects" section
    if (pathname.startsWith('/dashboard/projects') || PROJECT_ID_REGEX.test(pathname)) return 0;
    if (pathname.startsWith('/dashboard/gallery')) return 2;
    return 1; // default: /dashboard
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
}

export function PaneIndicator({ activeIndex, labels, size = 'normal' }: PaneIndicatorProps) {
    const dotWidth = size === 'small' ? 14 : 20;
    const dotHeight = size === 'small' ? 4 : 6;
    const inactiveDot = size === 'small' ? 4 : 6;

    return (
        <div className="flex items-center justify-center gap-1.5 py-1">
            {labels.map((_, i) => (
                <motion.div
                    key={i}
                    className={cn(
                        "rounded-full transition-colors duration-200",
                        i === activeIndex ? "bg-luxury-gold" : "bg-luxury-text/20"
                    )}
                    animate={{
                        width: i === activeIndex ? dotWidth : inactiveDot,
                        height: dotHeight,
                    }}
                    transition={M3Spring.expressive}
                />
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

export const MAIN_LABELS = ['Progetti', 'Bacheca', 'Galleria'] as const;
export const SUBPAGE_LABELS = ['Cantiere AI', 'Galleria', 'Settaggi'] as const;

// ─── Swipe Hint Affordance ───────────────────────────────────────────────────

function SwipeHints({ activeIndex, totalPanes }: { activeIndex: number; totalPanes: number }) {
    const canGoLeft = activeIndex > 0;
    const canGoRight = activeIndex < totalPanes - 1;

    return (
        <>
            {canGoLeft && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-20 pointer-events-none">
                    <ChevronLeft className="w-6 h-6 text-luxury-gold animate-pulse" />
                </div>
            )}
            {canGoRight && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-20 pointer-events-none">
                    <ChevronRight className="w-6 h-6 text-luxury-gold animate-pulse" />
                </div>
            )}
        </>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MobileSwipeLayout({ children }: MobileSwipeLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { isMobile } = useSidebar();

    // ── Detect if inside a project ──────────────────────────────────────────
    const isInsideProject = useMemo(() => PROJECT_ID_REGEX.test(pathname), [pathname]);

    // ── Derive active pane from current route ───────────────────────────────
    const activeIndex = useMemo(() => getActiveIndexFromPathname(pathname), [pathname]);

    const setActivePaneByIndex = useCallback(
        (newIndex: number) => {
            const route = PANE_ROUTES[newIndex];
            if (!route || newIndex === activeIndex) return;
            router.push(route);
        },
        [activeIndex, router],
    );

    // ── Swipe Navigation Hook (disabled inside projects — ProjectMobileTabs handles it) ──
    const { containerProps, swipeX } = useSwipeNavigation({
        panes: [...PANES],
        activeIndex,
        onSwipe: setActivePaneByIndex,
        enableHaptics: true,
    });

    // Desktop: render children only
    if (!isMobile) return <>{children}</>;

    // Inside a project: disable main swipe, let ProjectMobileTabs handle navigation
    if (isInsideProject) {
        return (
            <div className="relative h-[100dvh] w-full bg-luxury-bg overflow-hidden">
                {children}
            </div>
        );
    }

    return (
        <div
            className="relative h-[100dvh] w-full bg-luxury-bg overflow-hidden"
            {...containerProps}
        >
            {/* Swipe Hints (chevrons on edges) */}
            <SwipeHints activeIndex={activeIndex} totalPanes={PANES.length} />

            {/* Main Dashboard Content — uses MotionValue for zero-rerender drag */}
            <motion.div
                className="absolute inset-0 z-0 h-full w-full bg-luxury-bg touch-pan-y"
                style={{ x: swipeX }}
            >
                {children}
            </motion.div>
        </div>
    );
}
