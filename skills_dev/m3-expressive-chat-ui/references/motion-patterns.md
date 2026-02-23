# M3 Expressive Motion Patterns

## Core Animation Principles
- **Fluidity:** Use spring-based animations (non-linear) for message entry.
- **Bounciness:** Subtle overshoot on "bubble popping" effects.
- **Responsiveness:** Immediate visual feedback on touch/click.

## Spring Configurations (Framer Motion / Tailwind)
- **Standard Pop:** `stiffness: 300, damping: 20, mass: 1`
- **Expressive Entry:** `stiffness: 500, damping: 15, mass: 0.8` (higher bounce)

## Chat Specific Micro-interactions
1. **Message Entry:** 
   - `initial: { scale: 0.8, opacity: 0, y: 20 }`
   - `animate: { scale: 1, opacity: 1, y: 0 }`
   - `transition: { type: "spring", bounce: 0.4 }`
2. **Read Receipt:**
   - Sequential checkmark animation (fade + slight scale up).
3. **Reactions:**
   - Floating emojis with staggered spring entries.
