---
paths:
  - "web_client/**/*.{ts,tsx,js,jsx,css}"
---

# Frontend Architecture (Next.js + React)

## Framework
- Next.js 16 App Router (NOT Pages Router)
- Use **Server Components by default**, Client Components only with `'use client'`
- Firebase imports: **ALWAYS modular SDK v9+** (`import { getAuth } from 'firebase/auth'`)

## Dependencies & Lockfile (CRITICAL — read before any `npm install`)
- This is an **npm workspace**: the single `package-lock.json` lives at the **repo root**, not in `web_client/`. Run npm from the repo root.
- **Node version comes from `engines.node` (`^24.12.0`, the floor firebase 13 requires)** — CI reads it via `node-version-file: 'package.json'`, Vercel deploys the latest 24.x. Never hardcode `node-version` in a workflow (`__tests__/node-engines.test.ts` fails).
- **Touch the lockfile with the npm bundled with Node 24 (npm 11)** — the same npm CI (`npm ci` in every workflow, no pin) and Vercel (`installCommand: npm ci` in `web_client/vercel.json`) use. The old "npm 10 only" rule was dropped on 6 Nov 2026: npm 11 on Windows was verified to write only the bumped subtree, and `main` already carried npm 11 fields (`libc`) from Dependabot.
- Safe dependency bump: change the version in `web_client/package.json`, run `npm install` from the repo root, and confirm the diff vs `main` touches **only** the bumped package's subtree (no pruned `@tailwindcss/oxide-*` / `@img/sharp-*` optional variants, no unrelated re-resolutions). Never delete and regenerate the lockfile from scratch. The repo lockfile uses **4-space indentation** — preserve it.
- Verify locally before pushing: `npm ci` (mirrors CI), `npm run type-check`, `npm test`.

## Critical Files
- `lib/firebase.ts`: Firebase singleton init (must run before anything else)
- `components/chat/ChatProvider.tsx`: Real-time chat state + AI SDK v7 streaming
- `components/mobile/MobileSwipeLayout.tsx`: 60fps swipe navigation (3-pane layout)

## AI SDK v7 Patterns (CRITICAL)
```typescript
// CORRECT (v7):
sendMessage({ text: "input" }, { body: extraData })
// Messages use parts array: message.parts.map(p => p.type === 'text' ? p.text : ...)

// WRONG (v4/v5 — breaks message ordering):
sendMessage({ role: 'user', content: "input" } as any)
```

## State Management
- Server state: TanStack Query (`@tanstack/react-query`); shareable state (filters, pagination) in URL search params
- Auth: Firebase Client SDK with `AuthProvider` context
- Chat: Vercel AI SDK (`@ai-sdk/react`) → Next.js proxy `/api/chat` (`app/api/chat/route.ts`, pass-through SSE) → backend `/chat/stream`. Token streaming end-to-end: never buffer, re-frame or `Connection: close` in the proxy; `MessageItem` must not subscribe to the chat context (re-renders every message per token)

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
