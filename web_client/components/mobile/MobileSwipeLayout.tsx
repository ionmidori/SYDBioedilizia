"use client";

import React, { useCallback, useMemo } from 'react';
import { motion, useTransform, MotionValue } from 'framer-motion';
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

export const PANES = ['dashboard', 'gallery', 'projects'] as const;
export const PANE_ROUTES = ['/dashboard', '/dashboard/gallery', '/dashboard/projects'] as const;

const PROJECT_SUBPAGES = ['chat', 'files', 'settings'] as const;
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

// ─── Swipe Hint Affordance ───────────────────────────────────────────────────

export function SwipeHints({
    activeIndex,
    totalPanes,
    swipeX,
    hasExitGesture = false
}: {
    activeIndex: number;
    totalPanes: number;
    swipeX: MotionValue<number>;
    hasExitGesture?: boolean;
}) {
    const canGoLeft = activeIndex > 0 || hasExitGesture;
    const canGoRight = activeIndex < totalPanes - 1;

    // Swipe Right (dx > 0) -> Reveal Left Chevron (indicating we are going to a previous pane)
    const leftOpacity = useTransform(swipeX, [0, 80], [0, 1]);
    const leftX = useTransform(swipeX, [0, 80], [-20, 10]);
    const leftScale = useTransform(swipeX, [0, 80], [0.8, 1.2]);

    // Swipe Left (dx < 0) -> Reveal Right Chevron (indicating we are going to a next pane)
    const rightOpacity = useTransform(swipeX, [0, -80], [0, 1]);
    const rightX = useTransform(swipeX, [0, -80], [20, -10]);
    const rightScale = useTransform(swipeX, [0, -80], [0.8, 1.2]);

    return (
        <div className="absolute inset-y-0 left-0 right-0 pointer-events-none z-[110] overflow-hidden">
            {canGoLeft && (
                <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-16 h-24 bg-gradient-to-r from-luxury-bg/90 to-transparent rounded-r-3xl drop-shadow-2xl"
                    style={{ opacity: leftOpacity, x: leftX, scale: leftScale }}
                >
                    <ChevronLeft className="w-8 h-8 text-luxury-gold drop-shadow-lg" />
                </motion.div>
            )}
            {canGoRight && (
                <motion.div
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-16 h-24 bg-gradient-to-l from-luxury-bg/90 to-transparent rounded-l-3xl drop-shadow-2xl"
                    style={{ opacity: rightOpacity, x: rightX, scale: rightScale }}
                >
                    <ChevronRight className="w-8 h-8 text-luxury-gold drop-shadow-lg" />
                </motion.div>
            )}
        </div>
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
            style={{ touchAction: 'pan-y' }}
            {...containerProps}
        >
            {/* High-fidelity M3 Edge Swipe Indicators */}
            <SwipeHints activeIndex={activeIndex} totalPanes={PANES.length} swipeX={swipeX} />

            {/* Main Application Container — Fixed structural wrapper.
                Physical translation via 'style={{ x: swipeX }}' was removed because
                it generated a new containing block and deformed the fixed AppSidebar layout.
                Navigation is now handled purely functionally + native AnimatePresence. */}
            <div className="absolute inset-0 z-0 h-full w-full bg-luxury-bg">
                <div className="h-full w-full overflow-hidden bg-luxury-bg">
                    {children}
                </div>
            </div>
        </div>
    );
}
