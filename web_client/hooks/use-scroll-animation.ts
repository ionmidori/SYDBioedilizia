'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

/**
 * useScrollReveal — fade-in + translate on scroll enter.
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
      gsap.fromTo(
        ref.current,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
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
      gsap.fromTo(
        ref.current.querySelectorAll(childSelector),
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger,
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
