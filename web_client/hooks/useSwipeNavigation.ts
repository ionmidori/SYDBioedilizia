/**
 * useSwipeNavigation — Enterprise-grade swipe navigation hook
 *
 * Uses framer-motion's `useMotionValue` for compositor-level updates
 * during drag (zero React re-renders). Supports:
 *   - Direction locking (8px dead zone)
 *   - iOS edge exclusion (20px left)
 *   - `data-no-swipe` escape hatch for interactive content (CAD/maps)
 *   - Progressive haptic feedback (Android only)
 *   - Configurable thresholds
 *
 * @example
 * ```tsx
 * const { containerProps, swipeX, isSwiping } = useSwipeNavigation({
 *   panes: ['projects', 'dashboard', 'gallery'],
 *   activeIndex: 1,
 *   onSwipe: (newIdx) => setActiveIndex(newIdx),
 * });
 *
 * <div {...containerProps}>
 *   <motion.div style={{ x: swipeX }}>{children}</motion.div>
 * </div>
 * ```
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useMotionValue, animate } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { M3Spring } from '@/lib/m3-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwipeConfig {
    /** Ordered list of pane identifiers */
    panes: string[];
    /** Current active pane index */
    activeIndex: number;
    /** Callback fired when user completes a swipe to a new pane */
    onSwipe: (newIndex: number) => void;
    /** Callback fired when user swipes right past the first pane (exit gesture) */
    onSwipePastStart?: () => void;
    /** Minimum px offset to trigger a pane change (default: 80) */
    swipeThreshold?: number;
    /** Minimum px/ms velocity to trigger even below threshold (default: 0.5) */
    velocityThreshold?: number;
    /** Enable haptic vibration on swipe completion — Android only (default: true) */
    enableHaptics?: boolean;
    /** Pixels from left screen edge to ignore (iOS Safari back gesture, default: 20) */
    edgeExclusionZone?: number;
}

export interface SwipeResult {
    /** Spread these onto the swipeable container div */
    containerProps: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    /** Bind to `<motion.div style={{ x: swipeX }} />` — updates bypass React render */
    swipeX: MotionValue<number>;
    /** True while user is actively swiping horizontally */
    isSwiping: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Dead zone in px before direction lock is determined */
const DEAD_ZONE = 8;

/** Haptic vibration duration in ms */
const HAPTIC_DURATION_MS = 10;

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Checks if the touch target or any ancestor has `data-no-swipe` attribute
 * or is a horizontally scrollable container. This prevents swipe navigation
 * from hijacking scroll gestures on carousels, action rows, etc.
 */
function isNoSwipeTarget(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    while (el && el !== document.body) {
        if (el.hasAttribute('data-no-swipe')) return true;
        // Auto-detect native horizontal scroll containers
        if (el.scrollWidth > el.clientWidth) {
            const style = getComputedStyle(el);
            const overflowX = style.overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
        }
        el = el.parentElement;
    }
    return false;
}

/**
 * Attempts to fire haptic feedback via Vibration API (progressive enhancement).
 * Silently no-ops on iOS/Safari where the API is unsupported.
 */
function triggerHaptic(durationMs: number): void {
    try {
        // Suppress if no user interaction yet (prevents Chrome Intervention warning)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            // navigator.vibrate can only be called after user interaction
            // We use a try-catch, but some browsers still log a warning.
            // Explicitly checking if the document has focus or using a 'hasInteracted' flag
            // is safer. For now, we trust the wrap and the fact that swipes ARE interactions.
            navigator.vibrate(durationMs);
        }
    } catch {
        // Vibration API not supported — silent no-op
    }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSwipeNavigation(config: SwipeConfig): SwipeResult {
    const {
        panes,
        activeIndex,
        onSwipe,
        onSwipePastStart,
        swipeThreshold = 80,
        velocityThreshold = 0.5,
        enableHaptics = true,
        edgeExclusionZone = 20,
    } = config;

    // MotionValue drives the visual offset WITHOUT React re-renders
    const swipeX = useMotionValue(0);

    // Only `isSwiping` needs React state (for conditional CSS classes)
    const [isSwiping, setIsSwiping] = useState(false);

    // Refs for touch tracking (no re-renders)
    const startXRef = useRef(0);
    const startYRef = useRef(0);
    const startTimeRef = useRef(0);
    const directionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
    const isActiveRef = useRef(false);

    const onTouchStart = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            if (!touch) return;

            // iOS edge exclusion: ignore touches in the Safari back-gesture zone
            if (touch.clientX < edgeExclusionZone) return;

            // Escape hatch: bail out for interactive content (CAD, maps, canvas)
            if (isNoSwipeTarget(e.target)) return;

            startXRef.current = touch.clientX;
            startYRef.current = touch.clientY;
            startTimeRef.current = Date.now();
            directionLockedRef.current = null;
            isActiveRef.current = true;

            // Reset motion value to 0 (no animation, instant)
            swipeX.jump(0);
        },
        [edgeExclusionZone, swipeX],
    );

    const onTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isActiveRef.current) return;

            const touch = e.touches[0];
            if (!touch) return;

            const dx = touch.clientX - startXRef.current;
            const dy = touch.clientY - startYRef.current;

            // Direction lock: determine intent within the dead zone
            if (directionLockedRef.current === null) {
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                // Still within dead zone — wait for more data
                if (absDx < DEAD_ZONE && absDy < DEAD_ZONE) return;

                if (absDx > absDy) {
                    directionLockedRef.current = 'horizontal';
                    setIsSwiping(true);
                } else {
                    // Vertical scroll intent — bail out permanently for this gesture
                    directionLockedRef.current = 'vertical';
                    isActiveRef.current = false;
                    setIsSwiping(false);
                    return;
                }
            }

            if (directionLockedRef.current !== 'horizontal') return;

            // Boundary resistance: apply rubber-band effect at edges
            const isAtStart = activeIndex === 0 && dx > 0;
            const isAtEnd = activeIndex === panes.length - 1 && dx < 0;

            if (isAtStart && onSwipePastStart) {
                // Exit gesture available: allow full movement (damped) to hint navigability
                const dampedDx = Math.sign(dx) * Math.log2(1 + Math.abs(dx) * 0.3) * 12;
                swipeX.set(dampedDx);
            } else if (isAtStart || isAtEnd) {
                // Rubber-band: logarithmic damping at boundaries
                const dampedDx = Math.sign(dx) * Math.log2(1 + Math.abs(dx) * 0.5) * 8;
                swipeX.set(dampedDx);
            } else {
                swipeX.set(dx);
            }
        },
        [activeIndex, panes.length, swipeX],
    );

    const onTouchEnd = useCallback(
        () => {
            if (!isActiveRef.current) return;
            isActiveRef.current = false;

            const currentOffset = swipeX.get();
            const elapsed = Date.now() - startTimeRef.current;
            const velocity = elapsed > 0 ? Math.abs(currentOffset) / elapsed : 0; // px/ms

            let newIndex = activeIndex;

            // Determine if swipe should complete
            const passedThreshold = Math.abs(currentOffset) > swipeThreshold;
            const passedVelocity = velocity > velocityThreshold;

            if (passedThreshold || passedVelocity) {
                if (currentOffset < 0 && activeIndex < panes.length - 1) {
                    // Swiped left → next pane
                    newIndex = activeIndex + 1;
                } else if (currentOffset > 0 && activeIndex > 0) {
                    // Swiped right → previous pane
                    newIndex = activeIndex - 1;
                } else if (currentOffset > 0 && activeIndex === 0 && onSwipePastStart) {
                    // Swiped right past start → exit gesture
                    animate(swipeX, 0, M3Spring.expressive);
                    if (enableHaptics) triggerHaptic(HAPTIC_DURATION_MS);
                    onSwipePastStart();
                    setIsSwiping(false);
                    directionLockedRef.current = null;
                    return;
                }
            }

            // Animate back to 0 with M3 Expressive spring
            animate(swipeX, 0, M3Spring.expressive);

            // Fire callback if pane changed
            if (newIndex !== activeIndex) {
                if (enableHaptics) triggerHaptic(HAPTIC_DURATION_MS);
                onSwipe(newIndex);
            }

            setIsSwiping(false);
            directionLockedRef.current = null;
        },
        [activeIndex, enableHaptics, onSwipe, onSwipePastStart, panes.length, swipeThreshold, swipeX, velocityThreshold],
    );

    return {
        containerProps: { onTouchStart, onTouchMove, onTouchEnd },
        swipeX,
        isSwiping,
    };
}
