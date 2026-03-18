---
name: optimizing-nextjs-architecture
description: Implements Next.js 16 App Router patterns specific to SYD Bioedilizia. Covers Firebase SDK v9 integration, AI SDK v6 streaming, proxy.ts middleware, and 3-Tier architecture compliance. Use when building pages, optimizing performance, or integrating frontend with backend.
---

# Next.js 16 Architecture — SYD Patterns

## SYD-Specific Rules

### 3-Tier Law
Frontend -> Backend -> ADK is the ONLY flow. Never call Vertex AI or Firestore Admin SDK from frontend.

### Firebase Client SDK (v9+ modular ONLY)
```typescript
// CORRECT:
import { getAuth } from 'firebase/auth'
// WRONG (compat — NEVER use):
import firebase from 'firebase/compat/app'
```

Singleton init: [lib/firebase.ts](web_client/lib/firebase.ts)
Auth state: `AuthProvider` context wraps the app

### AI SDK v6 Message Format
```typescript
// CORRECT:
sendMessage({ text: "input" }, { body: extraData })
// Messages: message.parts.map(p => p.type === 'text' ? p.text : ...)

// WRONG (v4/v5 — breaks message ordering):
sendMessage({ role: 'user', content: "input" } as any)
```

### Middleware
Next.js 16 uses `proxy.ts` (NOT `middleware.ts`). CSP headers and Firebase Auth iframe policy configured there.

### Styling Stack
Tailwind 4 + Material Design 3 Expressive + Glassmorphism. Motion variants from [lib/m3-motion.ts](web_client/lib/m3-motion.ts).

## Standard Patterns

- Server Components by default; `'use client'` only for state/browser APIs
- `next/image` with `priority` for LCP elements
- `next/dynamic` for heavy client-side libraries
- `generateMetadata` for dynamic SEO
- `NEXT_PUBLIC_*` prefix for client-side env vars
