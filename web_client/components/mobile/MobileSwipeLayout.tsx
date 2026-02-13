"use client";

import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalGalleryContent } from '@/components/dashboard/GlobalGalleryContent';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/dashboard/SidebarProvider';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { M3Spring, M3Transition } from '@/lib/m3-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MobileSwipeLayoutProps {
    children: React.ReactNode;
}

const PANES = ['projects', 'dashboard', 'gallery'] as const;
type Pane = (typeof PANES)[number];
const DEFAULT_PANE_INDEX = 1; // 'dashboard'

// ─── Dot Indicator ───────────────────────────────────────────────────────────

function PaneIndicator({ activeIndex }: { activeIndex: number }) {
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
    const searchParams = useSearchParams();
    const { isMobile } = useSidebar();

    // ── URL-Synced Active Pane ──────────────────────────────────────────────
    const activeIndex = useMemo(() => {
        const viewParam = searchParams.get('pane') as Pane | null;
        const idx = PANES.indexOf(viewParam as Pane);
        return idx >= 0 ? idx : DEFAULT_PANE_INDEX;
    }, [searchParams]);

    const activePane = PANES[activeIndex];

    const setActivePaneByIndex = useCallback(
        (newIndex: number) => {
            const pane = PANES[newIndex];
            if (!pane || pane === PANES[activeIndex]) return;

            // "projects" pane → navigate to the real projects page for consistency
            // with sidebar navigation (both paths lead to /dashboard/projects)
            if (pane === 'projects') {
                router.push('/dashboard/projects');
                return;
            }

            // Shallow URL update — preserves back button navigation
            const params = new URLSearchParams(searchParams.toString());
            if (pane === 'dashboard') {
                params.delete('pane'); // Clean URL for default pane
            } else {
                params.set('pane', pane);
            }
            const query = params.toString();
            const newUrl = `${pathname}${query ? `?${query}` : ''}`;
            router.replace(newUrl, { scroll: false });
        },
        [activeIndex, pathname, router, searchParams],
    );

    // Return to dashboard (used by pane close buttons)
    const goToDashboard = useCallback(() => {
        setActivePaneByIndex(DEFAULT_PANE_INDEX);
    }, [setActivePaneByIndex]);

    // ── Swipe Navigation Hook ───────────────────────────────────────────────
    const { containerProps, swipeX, isSwiping } = useSwipeNavigation({
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
            {/* Pane Indicator Dots */}
            <div className="absolute top-0 left-0 right-0 z-30 bg-luxury-bg/80 backdrop-blur-sm">
                <PaneIndicator activeIndex={activeIndex} />
            </div>

            {/* Swipe Hints (chevrons on edges) */}
            <SwipeHints activeIndex={activeIndex} />

            {/* Main Dashboard Content — uses MotionValue for zero-rerender drag */}
            <motion.div
                className="absolute inset-0 z-0 h-full w-full bg-luxury-bg pt-8 touch-pan-y"
                style={{ x: swipeX }}
            >
                {children}
            </motion.div>

            {/* Gallery Overlay (slides from right) */}
            <AnimatePresence>
                {activePane === 'gallery' && (
                    <motion.div
                        key="gallery-pane"
                        className="absolute inset-0 z-50 h-full w-full bg-luxury-bg shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: '0%' }}
                        exit={{ x: '100%' }}
                        transition={M3Spring.expressive}
                    >
                        <div className="relative h-full w-full flex flex-col">
                            <div className="h-14 flex items-center justify-between px-4 border-b border-luxury-gold/10 bg-luxury-bg/95 backdrop-blur">
                                <span className="font-serif text-lg text-luxury-gold">Galleria Globale</span>
                                <button
                                    onClick={goToDashboard}
                                    className="p-2 hover:bg-luxury-gold/10 rounded-full text-luxury-text/60"
                                    aria-label="Chiudi galleria"
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

            {/* Scrim overlay behind active pane */}
            <AnimatePresence>
                {activePane !== 'dashboard' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={M3Transition.overlayFade}
                        className="absolute inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                        style={{ pointerEvents: 'none' }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
