'use client';

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/hooks/use-scroll-animation';

interface SnapRailProps {
    children: ReactNode;
    /** Accessible name for the scrollable region. */
    ariaLabel: string;
    /** CSS width applied to every item wrapper, e.g. "85vw". */
    itemWidth?: string;
    /** "center" makes the active card sit mid-screen; "start" suits rails with a terminal card. */
    align?: 'start' | 'center';
    /** CSS gap between items. */
    gap?: string;
    /** Renders the dot indicator below the rail. */
    showDots?: boolean;
    /**
     * How many items get a dot. Defaults to the child count — pass a smaller number
     * when trailing items (e.g. a "see all" card) should not be represented.
     */
    dotCount?: number;
    onActiveChange?: (index: number) => void;
    className?: string;
    dotsClassName?: string;
    /**
     * Advances the rail on its own, one card at a time, until the user touches it.
     *
     * Deliberately narrow: it stops for good on the first interaction (never resumes),
     * never loops back to the first card, only runs while the rail is actually on
     * screen, and is skipped entirely under `prefers-reduced-motion`.
     */
    autoPlay?: boolean;
    /** Time each card stays put before auto-play advances to the next one. */
    autoPlayDelayMs?: number;
}

/**
 * Horizontal scroll-snap rail.
 *
 * The scroll mechanics below are copied from the carousel in
 * `components/dashboard/ProjectsCarousel.tsx`, which had been tuned in
 * production — that file has not been migrated to this primitive yet, so the
 * two implementations currently need to be kept in sync by hand. The
 * non-obvious bits are load-bearing:
 *
 * - `overscrollBehaviorX: contain` stops the swipe from triggering browser back-nav
 *   or bubbling into the page scroll at the ends of the rail.
 * - `touchAction: pan-x pan-y` keeps vertical page scrolling alive while swiping.
 * - `translateZ(0)` promotes the rail to its own layer, which is what keeps the
 *   swipe at 60fps on mid-tier Android.
 * - `data-no-swipe` + `stopPropagation` on touchstart stops `useSwipeNavigation`
 *   (dashboard 3-pane layout) from stealing the horizontal gesture. Harmless on
 *   pages where that hook is not mounted.
 *
 * Active-item tracking uses IntersectionObserver rooted on the rail, never a scroll
 * listener.
 */
export function SnapRail({
    children,
    ariaLabel,
    itemWidth = '85vw',
    align = 'center',
    gap = '1rem',
    showDots = false,
    dotCount,
    onActiveChange,
    className,
    dotsClassName,
    autoPlay = false,
    autoPlayDelayMs = 4000,
}: SnapRailProps) {
    const railRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [isRailVisible, setIsRailVisible] = useState(false);

    const items = Children.toArray(children);
    const totalDots = dotCount ?? items.length;

    // Keep the latest callback without re-running the observer on every parent render.
    const onActiveChangeRef = useRef(onActiveChange);
    useEffect(() => {
        onActiveChangeRef.current = onActiveChange;
    }, [onActiveChange]);

    // ── Active item tracking ────────────────────────────────────────────────
    useEffect(() => {
        const rail = railRef.current;
        if (!rail || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            (entries) => {
                // Pick the most-visible entry of this batch rather than the last one,
                // otherwise a fast swipe past several cards lands on the wrong index.
                let best: IntersectionObserverEntry | null = null;
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    if (!best || entry.intersectionRatio > best.intersectionRatio) {
                        best = entry;
                    }
                }
                if (!best) return;

                const index = Number((best.target as HTMLElement).dataset.railIndex);
                if (Number.isNaN(index)) return;

                setActiveIndex(index);
                onActiveChangeRef.current?.(index);
            },
            { root: rail, threshold: 0.6 },
        );

        const nodes = rail.querySelectorAll<HTMLElement>('[data-rail-item]');
        nodes.forEach((node) => observer.observe(node));

        return () => observer.disconnect();
    }, [items.length]);

    const scrollToIndex = useCallback((index: number) => {
        const rail = railRef.current;
        if (!rail) return;

        const target = rail.querySelector<HTMLElement>(`[data-rail-index="${index}"]`);
        target?.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            inline: align,
            block: 'nearest',
        });
    }, [align]);

    // ── Gesture isolation from the dashboard swipe navigator ────────────────
    // Doubles as the auto-play interaction cutoff for touch: a swipe both isolates
    // from the parent gesture handler and permanently stops auto-advancing.
    useEffect(() => {
        const rail = railRef.current;
        if (!rail) return;

        const stop = (event: TouchEvent) => {
            event.stopPropagation();
            if (autoPlay) setHasInteracted(true);
        };
        rail.addEventListener('touchstart', stop, { passive: true });
        return () => rail.removeEventListener('touchstart', stop);
    }, [autoPlay]);

    // ── Auto-play: interaction cutoff for non-touch input ────────────────────
    // pointerdown covers mouse/pen drag-scroll, wheel covers trackpad/shift-scroll,
    // keydown covers tabbing into a card and using arrow keys. Once any of these
    // fires, auto-play never resumes for the life of this rail instance.
    useEffect(() => {
        if (!autoPlay) return;
        const rail = railRef.current;
        if (!rail) return;

        const stop = () => setHasInteracted(true);
        rail.addEventListener('pointerdown', stop, { passive: true });
        rail.addEventListener('wheel', stop, { passive: true });
        rail.addEventListener('keydown', stop);

        return () => {
            rail.removeEventListener('pointerdown', stop);
            rail.removeEventListener('wheel', stop);
            rail.removeEventListener('keydown', stop);
        };
    }, [autoPlay]);

    // ── Auto-play: only run while the rail is actually on screen ────────────
    // Separate from the active-item observer above: that one is rooted on the rail
    // itself to compare cards against each other, this one is rooted on the
    // viewport to know whether the rail is visible at all.
    useEffect(() => {
        if (!autoPlay) return;
        const rail = railRef.current;
        if (!rail || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            ([entry]) => setIsRailVisible(entry?.isIntersecting ?? false),
            { threshold: 0.5 },
        );
        observer.observe(rail);
        return () => observer.disconnect();
    }, [autoPlay]);

    // ── Auto-play: advance one card at a time ────────────────────────────────
    // Re-arms every time the active card changes, so this doubles as the loop: each
    // successful advance schedules the next one. Stops on the last card rather than
    // wrapping back to the first — an auto-play carousel that runs forever is the
    // anti-pattern (WCAG 2.2.2), a bounded one that settles is not.
    useEffect(() => {
        if (!autoPlay || hasInteracted || !isRailVisible) return;
        if (prefersReducedMotion()) return;
        if (activeIndex >= items.length - 1) return;

        const timer = setTimeout(() => {
            scrollToIndex(activeIndex + 1);
        }, autoPlayDelayMs);

        return () => clearTimeout(timer);
    }, [autoPlay, hasInteracted, isRailVisible, activeIndex, items.length, autoPlayDelayMs, scrollToIndex]);

    // For a centered rail, the item at rest (scrollLeft: 0, before any swipe) can only
    // be truly centered if there is enough side padding to scroll it there — a fixed
    // inset shorter than this leaves the first (and last) card visibly closer to one
    // edge, even though `snap-center` centers every card reached by scrolling.
    //
    // This is expressed in `vw`, not `%`: percentage padding resolves against the
    // *containing block* (the caller's wrapper), never against the rail's own box —
    // so it silently breaks the moment a caller applies a margin (both real callers do,
    // to cancel the section's own side padding for edge-to-edge dragging). `vw` is
    // viewport-relative and sidesteps that entirely, which is also why `itemWidth` on
    // this component is documented as a viewport-relative length in the first place.
    const centeringPadding = align === 'center'
        ? `calc((100vw - ${itemWidth}) / 2)`
        : undefined;

    return (
        <div className="relative w-full">
            <div
                ref={railRef}
                role="region"
                aria-label={ariaLabel}
                data-no-swipe
                // No `w-full`: a fixed `width: 100%` is pinned to the containing block and
                // does not grow to reclaim the space a negative margin (e.g. `-mx-4` in
                // Portfolio/Testimonials, for edge-to-edge dragging) opens up — the rail
                // would render short of the true screen edge on the side the margin
                // uncovers. Leaving width unset lets the block-layout `auto` width fill
                // whatever space the margin actually leaves available, same as `w-full`
                // for callers that pass no margin at all.
                className={cn('flex snap-x snap-mandatory scrollbar-hide', className)}
                style={{
                    overflowX: 'auto',
                    gap,
                    paddingInline: centeringPadding,
                    touchAction: 'pan-x pan-y',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehaviorX: 'contain',
                    transform: 'translateZ(0)',
                }}
            >
                {items.map((child, index) => (
                    <div
                        key={index}
                        data-rail-item
                        data-rail-index={index}
                        className={cn('shrink-0', align === 'center' ? 'snap-center' : 'snap-start')}
                        style={{ width: itemWidth }}
                    >
                        {child}
                    </div>
                ))}
            </div>

            {showDots && totalDots > 1 && (
                // Plain nav buttons, not a tablist: there is no associated tabpanel
                // and no arrow-key roving focus, so role="tab" would announce a
                // widget contract this doesn't fulfill. group + aria-pressed
                // describes what's actually here — a set of position shortcuts.
                <div
                    className={cn('flex items-center justify-center gap-1 mt-4', dotsClassName)}
                    role="group"
                    aria-label={`Naviga: ${ariaLabel}`}
                >
                    {Array.from({ length: totalDots }, (_, index) => {
                        const isActive = index === activeIndex;
                        return (
                            <button
                                key={index}
                                type="button"
                                aria-pressed={isActive}
                                aria-label={`Vai all'elemento ${index + 1} di ${totalDots}`}
                                onClick={() => {
                                    if (autoPlay) setHasInteracted(true);
                                    scrollToIndex(index);
                                }}
                                // 44x44 hit area (WCAG); the visible dot inside stays small.
                                className="flex h-11 w-11 items-center justify-center"
                            >
                                <span
                                    className={cn(
                                        'block rounded-full transition-all duration-300',
                                        isActive
                                            ? 'h-2 w-6 bg-luxury-gold'
                                            : 'h-2 w-2 bg-luxury-text/25',
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
