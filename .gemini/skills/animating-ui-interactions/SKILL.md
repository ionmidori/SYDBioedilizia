---
name: animating-ui-interactions
description: Implement high-fidelity, polished interactions and micro-animations using Framer Motion and Tailwind CSS. Use when adding "wow factor" and premium feel to the user interface.
---

# Animating UI Interactions

Create "alive" interfaces using motion design principles that guide user attention without being distracting.

## 1. The "Ease-Out" Principle
All entrance animations should use a decelerating ease for a professional, premium feel.
```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }} // Custom cubic-bezier for luxury feel
/>
```

## 2. Shared Layout Transitions
Use `layoutId` to morph elements across different states (e.g., expanding cards).
```tsx
<motion.div layoutId="active-pill" className="bg-indigo-500 rounded-full" />
```

## 3. Micro-interactions
- **Hover**: Subtle scale (1.02) or brightened border.
- **Tap**: Instant Feedback (0.98 scale).
- **Loading**: Pulse or shimmering skeleton, avoid jarring spinners.

## 4. Scroll-Triggered Presence
Use `whileInView` with a small `viewport` margin to reveal content as the user explores.

## 5. Next.js App Router Page Transitions (2026 Standard)
To achieve native-like, professional page transitions (e.g., sliding between dashboard sections) in the Next.js App Router:

1. **Use `template.tsx` instead of `layout.tsx`** for the animated wrapper. Templates mount a new instance on navigation, triggering `AnimatePresence` correctly.
2. **The `PageTransition` Wrapper Component**:
   ```tsx
   'use client';
   import { motion, AnimatePresence } from 'framer-motion';
   import { usePathname } from 'next/navigation';

   export function PageTransition({ children }: { children: React.ReactNode }) {
     const pathname = usePathname();
     return (
       <AnimatePresence mode="wait">
         <motion.div
           key={pathname}
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           exit={{ opacity: 0, x: -20 }}
           transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
           className="w-full h-full"
         >
           {children}
         </motion.div>
       </AnimatePresence>
     );
   }
   ```

## 6. Swipe Navigation (Mobile Dashboard UX)
For swipe-to-navigate functionality on mobile dashboards, leverage Framer Motion's `drag` events combined with Next.js `useRouter`.

```tsx
'use client';
import { motion, PanInfo } from 'framer-motion';
import { useRouter } from 'next/navigation';

export function SwipeablePage({ children, nextRoute, prevRoute }: any) {
  const router = useRouter();

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeThreshold = 50;
    if (info.offset.x < -swipeThreshold && nextRoute) {
      router.push(nextRoute); // Swipe Left -> Next
    } else if (info.offset.x > swipeThreshold && prevRoute) {
      router.push(prevRoute); // Swipe Right -> Previous
    }
  };

  return (
    <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={handleDragEnd}>
      {children}
    </motion.div>
  );
}
```

## Best Practices
- **Reduced Motion**: Respect `prefers-reduced-motion` settings.
- **GPU Optimization**: Use `transform` and `opacity` only. Avoid animating `width`, `height`, or `top/left/bottom/right`.
- **Orchestration**: Use `Variants` and `staggerChildren` for complex multi-element reveals.
