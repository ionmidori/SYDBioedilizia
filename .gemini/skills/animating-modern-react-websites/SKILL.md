---
name: animating-modern-react-websites
description: Implements scroll-driven animations, parallax, and smooth scrolling for SYD landing pages using Lenis, GSAP ScrollTrigger, and Framer Motion. Covers Lenis-GSAP sync, scroll reveal/parallax hooks, and accessibility. Use when building or enhancing landing page sections (Hero, Portfolio, Testimonials, Services).
---

# Animation Stack — SYD Landing Pages

Three libraries, three roles:

| Library | Role | Scope |
|---------|------|-------|
| **Lenis** | Smooth scrolling engine | Global (wraps app) |
| **GSAP + ScrollTrigger** | Scroll-driven animations (parallax, pin, reveal) | Landing page sections |
| **Framer Motion** | Component interactions (hover, modal, layout) | Dashboard + UI |

## Infrastructure Files

- [lib/smooth-scroll.tsx](web_client/lib/smooth-scroll.tsx) — `SmoothScrollProvider` (Lenis + GSAP sync)
- [hooks/use-scroll-animation.ts](web_client/hooks/use-scroll-animation.ts) — 4 hooks: `useScrollReveal`, `useScrollParallax`, `useScrollTimeline`, `useStaggerReveal`
- [lib/m3-motion.ts](web_client/lib/m3-motion.ts) — M3 Expressive spring presets for Framer Motion

## Quick Start — Scroll Reveal

```tsx
'use client';
import { useScrollReveal } from '@/hooks/use-scroll-animation';

export function Section() {
  const ref = useScrollReveal<HTMLDivElement>();
  return <div ref={ref} className="opacity-0">Revealed on scroll</div>;
}
```

## Quick Start — Stagger Children

```tsx
const ref = useStaggerReveal<HTMLDivElement>('.card', { stagger: 0.12 });
return (
  <div ref={ref}>
    {items.map(i => <div className="card opacity-0" key={i.id}>{i.name}</div>)}
  </div>
);
```

## Quick Start — Parallax

```tsx
const imgRef = useScrollParallax<HTMLImageElement>({ speed: 0.3 });
return <img ref={imgRef} src="/hero.jpg" alt="" />;
```

## Quick Start — Pinned Timeline

```tsx
const { containerRef, timelineRef } = useScrollTimeline<HTMLDivElement>({
  scrub: 1,
  pin: true,
});

useGSAP(() => {
  timelineRef.current
    ?.to('.step', { x: 300, stagger: 0.3 })
    .to('.cta', { scale: 1.2 });
}, { scope: containerRef });
```

## When to Use What

- **`useScrollReveal`**: Section titles, cards, text blocks entering viewport
- **`useStaggerReveal`**: Service grids, portfolio galleries, testimonial cards
- **`useScrollParallax`**: Background images, decorative elements
- **`useScrollTimeline`**: Multi-step storytelling, horizontal scroll sections, pinned sequences
- **Framer Motion (`M3Spring`)**: Modals, dropdowns, hover states, layout animations, AnimatePresence

## Accessibility — Prefers Reduced Motion

```tsx
// GSAP: wrap in matchMedia
gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
  // animations here — skipped entirely for users who prefer reduced motion
});

// Framer Motion: automatic via useReducedMotion()
```

## Critical Rules

1. **Never animate `width`, `height`, `margin`** — use `transform` (x, y, scale, rotate) + `opacity` only
2. **Always cleanup** — `useGSAP` handles this automatically via `scope` ref
3. **Lenis owns scrolling** — do NOT use CSS `scroll-smooth` or `scroll-behavior` (removed from `<html>`)
4. **Dashboard pages**: Use Framer Motion only (Lenis smooth scroll is global but GSAP ScrollTrigger hooks are for landing sections)
