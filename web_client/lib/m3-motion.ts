/**
 * Material 3 Expressive Motion Design Tokens
 *
 * Centralized motion system following M3 Expressive guidelines.
 * All animation values across the app MUST reference these tokens
 * instead of using ad-hoc magic numbers.
 *
 * @see https://m3.material.io/styles/motion/overview
 */

import type { Transition, Variants } from 'framer-motion';

// ─── Spring Presets ──────────────────────────────────────────────────────────

/** Spring configurations for framer-motion `transition` */
export const M3Spring = {
    /** High energy — swipe completions, page transitions */
    expressive: {
        type: 'spring' as const,
        stiffness: 380,
        damping: 30,
        mass: 1,
    },
    /** Default — container transforms, card movements */
    standard: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 26,
        mass: 0.8,
    },
    /** Low energy — subtle reveals, tooltips, fades */
    gentle: {
        type: 'spring' as const,
        stiffness: 200,
        damping: 22,
        mass: 1.2,
    },
    /** Playful — FAB press, toggle switches, badge pops */
    bouncy: {
        type: 'spring' as const,
        stiffness: 500,
        damping: 20,
        mass: 0.6,
    },
} as const;

// ─── Duration Tokens ─────────────────────────────────────────────────────────

/** Duration values (in seconds) for tween/keyframe animations */
export const M3Duration = {
    /** 50ms — micro interactions (ripple start) */
    short1: 0.05,
    /** 100ms — FAB press, icon swap */
    short2: 0.1,
    /** 200ms — container transforms, tab switch */
    medium1: 0.2,
    /** 300ms — page transitions, overlay fade */
    medium2: 0.3,
    /** 450ms — full-screen transitions */
    long1: 0.45,
    /** 700ms — dramatic reveals, onboarding */
    long2: 0.7,
} as const;

// ─── Easing Curves ───────────────────────────────────────────────────────────

/** CSS cubic-bezier easing curves for non-spring animations */
export const M3Easing = {
    /** Standard — most UI transitions */
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    /** Emphasized — draws attention to key moments */
    emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    /** Decelerate — elements entering the screen */
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    /** Accelerate — elements leaving the screen */
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
} as const;

// ─── framer-motion Easing Arrays ────────────────────────────────────────────

/** Easing as number arrays for framer-motion's `ease` prop */
export const M3EasingFM = {
    standard: [0.2, 0, 0, 1] as [number, number, number, number],
    emphasized: [0.05, 0.7, 0.1, 1] as [number, number, number, number],
    decelerate: [0, 0, 0, 1] as [number, number, number, number],
    accelerate: [0.3, 0, 1, 1] as [number, number, number, number],
} as const;

// ─── Composite Transitions ──────────────────────────────────────────────────

/** Pre-built transition objects ready for framer-motion */
export const M3Transition: Record<string, Transition> = {
    /** Page/pane transitions (swipe, tab switch) */
    pageSwipe: {
        ...M3Spring.expressive,
    },
    /** Container transforms (card expand, modal open) */
    containerTransform: {
        ...M3Spring.standard,
    },
    /** Overlay/scrim fade in/out */
    overlayFade: {
        duration: M3Duration.medium2,
        ease: M3EasingFM.standard,
    },
    /** Stagger parent — used with `staggerChildren` */
    staggerParent: {
        staggerChildren: 0.06,
        delayChildren: 0.1,
    },
    /** FAB / button press feedback */
    buttonPress: {
        ...M3Spring.bouncy,
    },
    /** Subtle element appearance */
    gentleReveal: {
        ...M3Spring.gentle,
    },
} as const;

// ─── Reusable Variant Factories ─────────────────────────────────────────────

/**
 * Creates stagger-entrance variants for a list container + items.
 *
 * Usage:
 * ```tsx
 * const { container, item } = createStaggerVariants({ y: 20 });
 * <motion.div variants={container} initial="hidden" animate="visible">
 *   {items.map(i => <motion.div key={i} variants={item} />)}
 * </motion.div>
 * ```
 */
export function createStaggerVariants(
    offset: { x?: number; y?: number } = { y: 24 },
    staggerDelay = 0.06,
): { container: Variants; item: Variants } {
    return {
        container: {
            hidden: { opacity: 0 },
            visible: {
                opacity: 1,
                transition: {
                    staggerChildren: staggerDelay,
                    delayChildren: 0.1,
                },
            },
        },
        item: {
            hidden: {
                opacity: 0,
                x: offset.x ?? 0,
                y: offset.y ?? 0,
            },
            visible: {
                opacity: 1,
                x: 0,
                y: 0,
                transition: M3Spring.standard,
            },
        },
    };
}

/**
 * Creates directional slide variants for tab/pane transitions.
 * Pass `custom={direction}` to `AnimatePresence` children:
 *   - `1` = slide from right (next)
 *   - `-1` = slide from left (previous)
 */
/**
 * Creates fade + vertical slide variants for page-level transitions.
 * Lighter than full horizontal slides — ideal for dashboard page changes.
 *
 * Usage with AnimatePresence:
 * ```tsx
 * <AnimatePresence mode="wait">
 *   <motion.div key={pathname} variants={fadeSlide} initial="enter" animate="center" exit="exit">
 *     {children}
 *   </motion.div>
 * </AnimatePresence>
 * ```
 */
export function createFadeSlideVariants(distance = 20): Variants {
    return {
        enter: {
            opacity: 0,
            y: distance,
        },
        center: {
            opacity: 1,
            y: 0,
            transition: M3Spring.gentle,
        },
        exit: {
            opacity: 0,
            y: -distance * 0.5,
            transition: {
                duration: M3Duration.medium1,
                ease: M3EasingFM.accelerate,
            },
        },
    };
}

export function createSlideVariants(distance = 300): Variants {
    return {
        enter: (direction: number) => ({
            x: direction > 0 ? distance : -distance,
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
            transition: M3Spring.expressive,
        },
        exit: (direction: number) => ({
            x: direction < 0 ? distance : -distance,
            opacity: 0,
            transition: {
                duration: M3Duration.medium1,
                ease: M3EasingFM.accelerate,
            },
        }),
    };
}
