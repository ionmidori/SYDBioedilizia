/**
 * True when the OS/browser has requested reduced motion.
 *
 * For imperative code (scroll calls, effects). In render, prefer framer-motion's
 * `useReducedMotion()`, which also re-renders when the preference changes.
 */
export const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
