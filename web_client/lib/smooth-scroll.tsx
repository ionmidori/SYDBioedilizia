'use client';

import { ReactLenis, useLenis } from 'lenis/react';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * useScrollLock — imperatively stop/start Lenis smooth scrolling.
 *
 * Lenis operates via RAF transforms and ignores CSS `overflow: hidden`.
 * When an overlay (chatbot, lightbox, modal) needs to lock page scroll,
 * call this hook with `locked = true` to freeze Lenis and restore on close.
 *
 * @param locked — whether page scroll should be locked
 */
export function useScrollLock(locked: boolean) {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    if (locked) {
      lenis.stop();
    } else {
      lenis.start();
    }

    return () => {
      // Always re-enable on unmount to avoid leaving scroll frozen
      lenis.start();
    };
  }, [lenis, locked]);
}

/**
 * SmoothScrollProvider — wraps the app in Lenis smooth scrolling
 * and syncs Lenis RAF with GSAP ScrollTrigger.
 *
 * Place inside layout.tsx, OUTSIDE ChatProvider (chat panes scroll independently).
 *
 * @see https://github.com/darkroomengineering/lenis
 */
export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<InstanceType<typeof import('lenis').default> | null>(null);

  useLenis((lenis) => {
    lenisRef.current = lenis;
  });

  // Sync Lenis scroll position → GSAP ScrollTrigger on every frame
  useEffect(() => {
    function update(time: number) {
      lenisRef.current?.raf(time * 1000);
    }
    gsap.ticker.add(update);

    // Tell ScrollTrigger to ask Lenis for scroll position
    ScrollTrigger.defaults({ scroller: undefined }); // use window
    ScrollTrigger.scrollerProxy(document.documentElement, {
      scrollTop(value) {
        if (arguments.length && lenisRef.current) {
          lenisRef.current.scrollTo(value as number, { immediate: true });
        }
        return lenisRef.current?.scroll ?? window.scrollY;
      },
      getBoundingClientRect() {
        return {
          top: 0,
          left: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        };
      },
      pinType: document.documentElement.style.transform ? 'transform' : 'fixed',
    });

    ScrollTrigger.addEventListener('refresh', () => lenisRef.current?.resize());
    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(update);
      ScrollTrigger.killAll();
    };
  }, []);

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.2,
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      }}
    >
      {children}
    </ReactLenis>
  );
}
