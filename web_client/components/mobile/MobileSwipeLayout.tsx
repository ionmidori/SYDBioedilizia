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

// ─── Helpers (exported for DashboardHeader) ─────────────────────────────────

export function getActiveIndexFromPathname(pathname: string): number {
    if (pathname.startsWith('/dashboard/projects')) return 0;
    if (pathname.startsWith('/dashboard/gallery')) return 2;
    return 1; // default: /dashboard
}

// ─── Dot Indicator (exported for DashboardHeader) ───────────────────────────

export function PaneIndicator({ activeIndex }: { activeIndex: number }) {
    const labels = ['Progetti', 'Dashboard', 'Galleria'];
    return (
        <div className="flex items-center justify-center gap-2 py-1.5">
            {PANES.map((_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                    <motion.div
                        className={cn(
                            "rounded-full transition-colors duration-200",
                            i === activeIndex
                                ? "bg-luxury-gold"
                                : "bg-luxury-text/20"
                        )}
                        animate={{
                            width: i === activeIndex ? 20 : 6,
                            height: 6,
                        }}
                        transition={M3Spring.expressive}
                    />
                </div>
            ))}
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-luxury-text/40">
                {labels[activeIndex]}
            </span>
        </div>
    );
}

// ─── Swipe Hint Affordance ───────────────────────────────────────────────────

function SwipeHints({ activeIndex }: { activeIndex: number }) {
    const canGoLeft = activeIndex > 0;
    const canGoRight = activeIndex < PANES.length - 1;

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

    // ── Swipe Navigation Hook ───────────────────────────────────────────────
    const { containerProps, swipeX } = useSwipeNavigation({
        panes: [...PANES],
        activeIndex,
        onSwipe: setActivePaneByIndex,
        enableHaptics: true,
    });

    // Desktop: render children only
    if (!isMobile) return <>{children}</>;

    return (
        <div
            className="relative h-[100dvh] w-full bg-luxury-bg overflow-hidden"
            {...containerProps}
        >
            {/* Swipe Hints (chevrons on edges) */}
            <SwipeHints activeIndex={activeIndex} />

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
