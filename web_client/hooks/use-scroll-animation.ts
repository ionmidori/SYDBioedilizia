'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

// ─── Device / Motion Utilities ────────────────────────────────────────────────

/** True when the OS/browser has requested reduced motion. */
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * True on touch-primary devices (phones, tablets).
 * Uses `pointer: coarse` — more reliable than UA sniffing or innerWidth.
 */
const isMobileDevice = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches;

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useScrollReveal — fade-in + translate on scroll enter.
 *
 * Mobile: smaller y offset (max 20px) + shorter duration (0.5s).
 * Reduced-motion: element appears instantly with no animation.
 *
 * Usage:
 * ```tsx
 * const ref = useScrollReveal<HTMLDivElement>();
 * return <div ref={ref} className="opacity-0">Content</div>;
 * ```
 */
export function useScrollReveal<T extends HTMLElement>(
  options: {
    y?: number;
    duration?: number;
    delay?: number;
    start?: string;
  } = {},
) {
  const ref = useRef<T>(null);
  const { y = 40, duration = 0.8, delay = 0, start = 'top 85%' } = options;

  useGSAP(
    () => {
      if (!ref.current) return;

      if (prefersReducedMotion()) {
        gsap.set(ref.current, { opacity: 1, y: 0 });
        return;
      }

      const mobile = isMobileDevice();
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: mobile ? Math.min(y, 20) : y },
        {
          opacity: 1,
          y: 0,
          duration: mobile ? 0.5 : duration,
          delay,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: ref.current,
            start,
            toggleActions: 'play none none none',
          },
        },
      );
    },
    { scope: ref, dependencies: [] },
  );

  return ref;
}

/**
 * useScrollParallax — subtle parallax shift tied to scroll.
 *
 * Mobile: skipped entirely (parallax is GPU-heavy on touch devices;
 * the element renders at its natural CSS position instead).
 * Reduced-motion: also skipped.
 *
 * Usage:
 * ```tsx
 * const ref = useScrollParallax<HTMLImageElement>({ speed: 0.3 });
 * return <img ref={ref} src="..." />;
 * ```
 */
export function useScrollParallax<T extends HTMLElement>(
  options: { speed?: number; direction?: 'y' | 'x' } = {},
) {
  const ref = useRef<T>(null);
  const { speed = 0.2, direction = 'y' } = options;

  useGSAP(
    () => {
      if (!ref.current) return;

      // Skip on touch devices and reduced-motion: parallax is expensive + disorienting.
      if (prefersReducedMotion() || isMobileDevice()) return;

      const distance = speed * 100;
      gsap.fromTo(
        ref.current,
        { [direction]: -distance },
        {
          [direction]: distance,
          ease: 'none',
          scrollTrigger: {
            trigger: ref.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      );
    },
    { scope: ref, dependencies: [] },
  );

  return ref;
}

/**
 * useScrollTimeline — full GSAP timeline tied to scroll progress.
 * Returns a ref for the container and a timeline builder callback.
 *
 * Reduced-motion: timeline created but no ScrollTrigger (elements animate instantly).
 *
 * Usage:
 * ```tsx
 * const { containerRef, timelineRef } = useScrollTimeline<HTMLDivElement>({
 *   scrub: 1,
 *   pin: true,
 * });
 *
 * useGSAP(() => {
 *   timelineRef.current
 *     ?.to('.card', { x: 300, stagger: 0.2 })
 *     .to('.title', { scale: 1.5 });
 * }, { scope: containerRef });
 * ```
 */
export function useScrollTimeline<T extends HTMLElement>(
  options: {
    start?: string;
    end?: string;
    scrub?: boolean | number;
    pin?: boolean;
  } = {},
) {
  const containerRef = useRef<T>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const {
    start = 'top top',
    end = 'bottom bottom',
    scrub = 1,
    pin = false,
  } = options;

  useEffect(() => {
    if (!containerRef.current) return;

    if (prefersReducedMotion()) {
      // Create timeline without scroll binding — animations play at their natural speed.
      timelineRef.current = gsap.timeline();
      return () => { timelineRef.current?.kill(); };
    }

    timelineRef.current = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start,
        end,
        scrub,
        pin,
      },
    });

    return () => {
      timelineRef.current?.kill();
    };
  }, [start, end, scrub, pin]);

  return { containerRef, timelineRef };
}

/**
 * useStaggerReveal — stagger children on scroll enter.
 *
 * Mobile: reduced y (max 20px), faster duration (0.5s), tighter stagger (0.08s)
 * so the entire group finishes in under 0.5s on any number of cards.
 * Reduced-motion: all children appear instantly.
 *
 * Usage:
 * ```tsx
 * const ref = useStaggerReveal<HTMLDivElement>('.card');
 * return <div ref={ref}>{cards.map(c => <div className="card" key={c} />)}</div>;
 * ```
 */
export function useStaggerReveal<T extends HTMLElement>(
  childSelector: string,
  options: { y?: number; stagger?: number; start?: string } = {},
) {
  const ref = useRef<T>(null);
  const { y = 30, stagger = 0.1, start = 'top 80%' } = options;

  useGSAP(
    () => {
      if (!ref.current) return;
      const children = ref.current.querySelectorAll(childSelector);
      if (!children.length) return;

      if (prefersReducedMotion()) {
        gsap.set(children, { opacity: 1, y: 0 });
        return;
      }

      const mobile = isMobileDevice();
      gsap.fromTo(
        children,
        { opacity: 0, y: mobile ? Math.min(y, 20) : y },
        {
          opacity: 1,
          y: 0,
          duration: mobile ? 0.5 : 0.7,
          stagger: mobile ? 0.08 : stagger,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: ref.current,
            start,
            toggleActions: 'play none none none',
          },
        },
      );
    },
    { scope: ref, dependencies: [] },
  );

  return ref;
}
