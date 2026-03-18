---
name: m3-expressive-chat-ui
description: Implements Material Design 3 Expressive chat interfaces for SYD with fluid spring animations, asymmetric message bubbles, and micro-interactions. Use when building or enhancing chat components, message feedback, or typing indicators.
---

# M3 Expressive Chat UI — SYD

## Implementation Files

- [lib/m3-motion.ts](web_client/lib/m3-motion.ts) — Spring presets, duration tokens, easing, variant factories
- [components/chat/ChatHeader.tsx](web_client/components/chat/ChatHeader.tsx) — Header with status
- [components/chat/MessageItem.tsx](web_client/components/chat/MessageItem.tsx) — Message rendering with feedback

## Motion System

Use SYD's M3 presets — never ad-hoc spring values:

```tsx
import { M3Spring, M3Transition, createStaggerVariants } from '@/lib/m3-motion';

// Message entrance
<motion.div
  initial={{ opacity: 0, scale: 0.9, y: 10 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={M3Spring.standard}
/>

// Message list stagger
const { container, item } = createStaggerVariants({ y: 20 });
```

### Spring Presets

| Preset | Use Case | Stiffness/Damping |
|--------|----------|-------------------|
| `M3Spring.expressive` | Page swipes, hero transitions | 380/30 |
| `M3Spring.standard` | Message entrance, card transforms | 300/26 |
| `M3Spring.gentle` | Tooltips, fades, subtle reveals | 200/22 |
| `M3Spring.bouncy` | FAB press, reaction pop, badge | 500/20 |

## Chat Patterns

### Asymmetric Bubbles
```tsx
// User (right): rounded top-left, flat bottom-right
className="rounded-[24px_24px_4px_24px] bg-primary text-on-primary"
// Assistant (left): rounded top-right, flat bottom-left
className="rounded-[24px_24px_24px_4px] bg-surface-container-high"
```

### Feedback Micro-interactions
- **Thumbs up/down**: `M3Spring.bouncy` scale pop on click
- **Typing indicator**: 3 dots with staggered `scaleY` animation (0.06s delay each)
- **Read receipts**: Double-check icon with `M3Spring.gentle` opacity fade

### AnimatePresence for Messages
```tsx
<AnimatePresence mode="popLayout">
  {messages.map(msg => (
    <motion.div key={msg.id} layout exit={{ opacity: 0, scale: 0.9 }}>
      <MessageItem message={msg} />
    </motion.div>
  ))}
</AnimatePresence>
```
