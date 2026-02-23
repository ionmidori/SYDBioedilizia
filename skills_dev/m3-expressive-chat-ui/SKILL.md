---
name: m3-expressive-chat-ui
description: Design and implementation of modern chat feedback graphics in Material Design 3 Expressive style. Includes patterns for fluid motion, expressive shapes, and micro-interactions for message states.
---

# M3 Expressive Chat UI Skill

This skill provides expert guidance for building modern, emotionally resonant chat interfaces using Material Design 3 Expressive principles.

## Core Concepts
- **Expressive Shapes:** Extra-rounded, asymmetric bubbles to indicate direction and personality.
- **Fluid Motion:** Spring-based, bouncy animations for entry and state changes.
- **Micro-Interactions:** Subtle feedback for typing, reading, and reactions.

## How to Apply

### 1. Shape Design
Use asymmetric rounding for bubbles to distinguish between sent and received messages.
- Reference: [shape-specs.md](references/shape-specs.md)

### 2. Motion Implementation
Implement spring-based animations for message arrival and interaction.
- Reference: [motion-patterns.md](references/motion-patterns.md)

### 3. Feedback Micro-interactions
- **Typing Indicator:** 3 dots with staggered scale-up animations.
- **Read Receipts:** Double-check animations with slight bounce.
- **Reactions:** Spring-loaded pop-up for emojis.

## Example (Framer Motion + Tailwind)
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.9, y: 10 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 300, damping: 25 }}
  className="bg-primary text-on-primary rounded-[24px_24px_4px_24px] px-4 py-2"
>
  Message content
</motion.div>
```
