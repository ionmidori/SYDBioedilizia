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
- **Use npm 10 / Node 22 to touch the lockfile** — this is what CI runs (`.github/workflows/frontend-checks.yml`: `npm ci` + `npm audit --audit-level=high` + `npm run type-check`).
- **Do NOT regenerate the lockfile with npm 11.** On Windows/npm 11 a plain `npm install` silently corrupts it in ways CI's npm 10 rejects:
  - prunes optional cross-platform deps (`@emnapi/*`, `@tailwindcss/oxide`/`sharp` WASM variants),
  - re-resolves unrelated ranges (e.g. downgrades the `eslint@10` tree).
  - Result: CI fails fast (~8s) at `npm ci` with `Missing <pkg> from lock file`, **even though local `npm ci` on npm 11 passes** (false green).
- Safe dependency bump: change the version in `web_client/package.json`, then regenerate the lockfile with **npm 10** (`npx -y npm@10 install --package-lock-only` if your default npm is 11), and confirm the diff vs `main` touches **only** the bumped package's subtree. The repo lockfile uses **4-space indentation** — preserve it.
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
