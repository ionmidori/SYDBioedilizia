---
name: animating-ui-interactions
description: Component-level micro-animations and interactions using Framer Motion with M3 Expressive tokens. Use when adding hover/tap feedback, shared layout transitions, page transitions, or stagger reveals.
---

# Animating UI Interactions

Framer Motion handles component-level animations. For scroll-driven animations, see `animating-modern-react-websites`.

## Motion Token System

All animations MUST use tokens from `lib/m3-motion.ts` — never ad-hoc magic numbers.

| Token | Use Case | Example |
|-------|----------|---------|
| `M3Spring.expressive` | Swipe completions, page transitions | `transition={M3Spring.expressive}` |
| `M3Spring.standard` | Card expand, modal open | Container transforms |
| `M3Spring.gentle` | Subtle reveals, tooltips | Fade-in elements |
| `M3Spring.bouncy` | FAB press, toggle, badge pop | Button feedback |
| `M3Transition.staggerParent` | List reveals | `staggerChildren: 0.06` |

## Stagger List Pattern

Use `createStaggerVariants()` from `lib/m3-motion.ts`:

```tsx
import { motion } from 'framer-motion';
import { createStaggerVariants } from '@/lib/m3-motion';

const { container, item } = createStaggerVariants({ y: 20 });

<motion.div variants={container} initial="hidden" animate="visible">
  {items.map(i => <motion.div key={i.id} variants={item}>{i.name}</motion.div>)}
</motion.div>
```

## Micro-Interactions

```tsx
// Hover + Tap feedback (use M3Spring.bouncy for buttons)
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={M3Spring.bouncy}
/>
```

## Shared Layout Transitions

```tsx
// Morph active indicator between tabs/pills
<motion.div layoutId="active-tab" className="bg-primary rounded-full"
  transition={M3Spring.standard} />
```

## Page Transitions (App Router)

Use `template.tsx` (not `layout.tsx`) — templates remount on navigation, triggering `AnimatePresence`:

```tsx
'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { M3Spring } from '@/lib/m3-motion';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={pathname}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={M3Spring.expressive}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

## AnimatePresence for Conditional Content

```tsx
<AnimatePresence mode="wait">
  {step === 'confirm' && (
    <motion.div key="confirm"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={M3Spring.standard}>
      {/* Step content */}
    </motion.div>
  )}
</AnimatePresence>
```

## Rules

- **Reduced motion**: Always respect `prefers-reduced-motion` — wrap in `useReducedMotion()`
- **GPU only**: Animate `transform` and `opacity` only. Never `width`, `height`, `top/left`
- **No scroll triggers here**: Use GSAP ScrollTrigger hooks from `hooks/use-scroll-animation.ts` for scroll-driven effects
- **SYD reference files**: `lib/m3-motion.ts`, `components/mobile/MobileSwipeLayout.tsx`
