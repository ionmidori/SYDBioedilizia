'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, useInView, type AnimationPlaybackControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/lib/reduced-motion';

/** `power2.out`: fast off the mark, settling onto the final number. */
const COUNT_EASE: [number, number, number, number] = [0.5, 1, 0.89, 1];
const COUNT_DURATION_S = 1.4;

interface StatCounterProps {
    /** Final number to count up to. */
    value: number;
    /** Appended verbatim after the number, e.g. "+", "h", "/5". */
    suffix?: string;
    /** Decimal places — 1 for a rating like 4.9, 0 for a whole count. */
    decimals?: number;
    className?: string;
}

/**
 * A number that counts up from zero every time it scrolls into view.
 *
 * The formatting is parameterised rather than baked in because the stats it renders
 * are not homogeneous: "100+", "24h" and "4.9/5" differ in both suffix and precision.
 *
 * Two properties are load-bearing:
 *
 * - **The server renders the final value**, not zero. Crawlers and no-JS visitors get
 *   the real number, and there is no layout shift when the count starts.
 * - **The zero state is written in a layout effect**, before the browser paints, so
 *   the swap from the server-rendered value never reaches the screen.
 */
export function StatCounter({
    value,
    suffix = '',
    decimals = 0,
    className,
}: StatCounterProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const countRef = useRef<AnimationPlaybackControls | null>(null);
    // Enters when the number crosses 85% of the viewport height, like the old
    // ScrollTrigger `start: 'top 85%'`.
    const inView = useInView(ref, { margin: '0px 0px -15% 0px' });
    const format = (n: number) => `${n.toFixed(decimals)}${suffix}`;

    // Reduced motion keeps the server-rendered final value untouched.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || prefersReducedMotion()) return;
        el.textContent = format(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- format derives from these
    }, [value, suffix, decimals]);

    // Restart on every entry — scrolling down into view and scrolling back up into
    // it. Leaving is deliberately a no-op: a count still running when the number
    // scrolls away finishes on its final value instead of freezing half-way.
    useEffect(() => {
        const el = ref.current;
        if (!el || !inView || prefersReducedMotion()) return;

        countRef.current?.stop();
        countRef.current = animate(0, value, {
            duration: COUNT_DURATION_S,
            ease: COUNT_EASE,
            onUpdate: (n) => {
                el.textContent = format(n);
            },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- format derives from these
    }, [inView, value, suffix, decimals]);

    useEffect(() => () => countRef.current?.stop(), []);

    // tabular-nums keeps every digit the same width, so the number does not jitter
    // sideways while it counts.
    return (
        <span ref={ref} className={cn('tabular-nums', className)}>
            {format(value)}
        </span>
    );
}
