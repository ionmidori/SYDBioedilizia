---
name: animating-modern-react-websites
description: Master modern web animation patterns for React and Next.js applications in 2026. Use this skill when implementing smooth scrolling, complex timeline animations, parallax effects, or high-performance interactions using Lenis, Framer Motion, and GSAP.
---

# Animating Modern React Websites (2026 Standards)

This skill provides enterprise-grade patterns for creating fluid, high-performance animated websites using the modern 2026 tech stack: Next.js App Router, Lenis (Smooth Scroll), Framer Motion (Interactions), and GSAP (Complex Timelines/ScrollTrigger).

## 1. Smooth Scrolling with Lenis

Smooth scrolling is the foundation of a modern animated website. In 2026, `lenis` is the absolute standard.

### Global Setup (Next.js App Router)
Wrap your application in a global provider, usually inside your root layout or a dedicated client component wrapper.

```tsx
'use client';

import { ReactLenis } from 'lenis/react';

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.5, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
```

## 2. UI Interactions & Layout Transitions (Framer Motion)

Use Framer Motion for micro-interactions, layout animations, and component-level presence.

### Spring Configurations
Avoid default tweens. Use physics-based springs for natural feel.

```typescript
// lib/motion.ts
export const premiumSpring = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};
```

### Page Transitions
Use `AnimatePresence` with a custom template in Next.js to animate route changes seamlessly.

## 3. High-Performance Scroll Animations (GSAP + ScrollTrigger)

For parallax, pinning, and complex sequences tied to scroll, use GSAP.

### Setup and Cleanup (React 18+)
Always use GSAP's `useGSAP` hook for automatic cleanup to prevent memory leaks and strict mode double-firing issues.

```tsx
'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

export function ScrollSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // ScrollTrigger instance
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: container.current,
        start: "top center",
        end: "bottom top",
        scrub: 1, // Tie to scrollbar
        pin: true,
      }
    });

    tl.to(".box", { x: 500, rotation: 360, duration: 2 });
  }, { scope: container });

  return (
    <div ref={container} className="h-[200vh]">
      <div className="box w-32 h-32 bg-primary" />
    </div>
  );
}
```

## 4. Accessibility & Performance (Security/A11y Mandate)

1. **Prefers Reduced Motion**: Always respect user OS settings.
   - Framer Motion: Handled automatically by default, or use `useReducedMotion()`.
   - GSAP: Wrap timelines in `gsap.matchMedia()`.
2. **Will-Change**: Apply `will-change: transform` strictly to elements animating actively. Remove after animation to free GPU memory.
3. **Hardware Acceleration**: Always animate `transform` (x, y, scale, rotate) and `opacity`. Never animate layout properties like `width`, `height`, or `margin` to prevent reflows.

## When to use what:
- **Framer Motion**: Modals, dropdowns, hover states, list staggering, simple entrance animations.
- **GSAP**: Scroll sequences, SVG morphing, text reveal lines, parallax, pinned sections.
- **Lenis**: Base smooth scrolling engine (synchronize GSAP's ScrollTrigger with Lenis's RAF).
