---
paths:
  - "web_client/**/*.{ts,tsx,js,jsx,css}"
---

# Frontend Architecture (Next.js + React)

## Framework
- Next.js 16 App Router (NOT Pages Router)
- Use **Server Components by default**, Client Components only with `'use client'`
- Firebase imports: **ALWAYS modular SDK v9+** (`import { getAuth } from 'firebase/auth'`)

## Critical Files
- `lib/firebase.ts`: Firebase singleton init (must run before anything else)
- `components/chat/ChatProvider.tsx`: Real-time chat state + AI SDK v6 streaming
- `components/mobile/MobileSwipeLayout.tsx`: 60fps swipe navigation (3-pane layout)

## AI SDK v6 Patterns (CRITICAL)
```typescript
// CORRECT (v6):
sendMessage({ text: "input" }, { body: extraData })
// Messages use parts array: message.parts.map(p => p.type === 'text' ? p.text : ...)

// WRONG (v4/v5 — breaks message ordering):
sendMessage({ role: 'user', content: "input" } as any)
```

## State Management
- URL-driven + SWR for server state
- Auth: Firebase Client SDK with `AuthProvider` context
- Chat: Vercel AI SDK (`@ai-sdk/react`) streams from `/chat/stream`

## Styling (Tailwind 4 + M3 Expressive)
- Material Design 3 Expressive + Glassmorphism
- Surface classes: `.surface-container-low`, `.surface-container-high` (in `globals.css`)
- Motion: Use `lib/m3-motion.ts` variants for consistent animations
- Responsive: Mobile-first (`md:`, `lg:` breakpoints)

## Error Boundaries
Every page has hierarchical boundaries (`error.tsx`, `global-error.tsx`)

## Testing (Jest + React Testing Library)
- `jest.setup.js` mocks ALL Firebase SDK modules
- Tests MUST match component implementation, not vice versa
- Mock `visualViewport` API for mobile component tests
- Coverage target: 70%

## Mobile UX
Custom swipe engine (NOT a library):
- Framer Motion `MotionValue` + `useMotionValueEvent`
- 3-pane: Dashboard, Gallery, Chat
- Notch draggable: 48x48px touch target (WCAG)
