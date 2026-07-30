'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/hooks/use-scroll-animation';

gsap.registerPlugin(ScrollTrigger);

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
 * - **The zero state is written in a layout effect** (`useGSAP` runs before paint), so
 *   the swap from the server-rendered value never reaches the screen.
 */
export function StatCounter({
    value,
    suffix = '',
    decimals = 0,
    className,
}: StatCounterProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const format = (n: number) => `${n.toFixed(decimals)}${suffix}`;

    useGSAP(
        () => {
            const el = ref.current;
            // Reduced motion keeps the server-rendered final value untouched.
            if (!el || prefersReducedMotion()) return;

            const proxy = { n: 0 };
            el.textContent = format(0);

            gsap.to(proxy, {
                n: value,
                duration: 1.4,
                // Decelerating ease: fast off the mark, settling onto the final number
                // rather than crawling the last stretch at constant speed.
                ease: 'power2.out',
                onUpdate: () => {
                    el.textContent = format(proxy.n);
                },
                scrollTrigger: {
                    trigger: el,
                    start: 'top 85%',
                    // GSAP's order is onEnter/onLeave/onEnterBack/onLeaveBack. `restart`
                    // sits on the two *entering* events (scrolling down into view, and
                    // scrolling back up into view) — `none` on both *leaving* events
                    // means the number is left resting on its final value while off
                    // screen, never caught mid-count while actually scrolling away.
                    // (`once: true` here would fire once ever, for the page's lifetime.)
                    toggleActions: 'restart none restart none',
                },
            });
        },
        { scope: ref, dependencies: [value, suffix, decimals] },
    );

    // tabular-nums keeps every digit the same width, so the number does not jitter
    // sideways while it counts.
    return (
        <span ref={ref} className={cn('tabular-nums', className)}>
            {format(value)}
        </span>
    );
}
