---
name: optimizing-nextjs-architecture
description: Implement elite Next.js App Router patterns, focusing on Server Components, optimized data fetching, and SEO-first architecture. Use when building core page structures or optimizing application performance.
---

# Optimizing Next.js Architecture

Adhere to enterprise-grade Next.js 14+ standards to ensure blazing-fast performance and maintainability.

## 1. The React Server Components (RSC) FIRST Law
- **Mandate**: Use Server Components by default.
- **Client Boundary**: Only use `"use client"` for leaf components requiring state (Zustand/useState) or browser APIs (framer-motion, window).
- **Data Fetching**: Fetch data directly in Server Components using `async/await`. Avoid `useEffect` for initial data loads.

## 2. Advanced Routing & Layouts
- **Parallel Routes**: Use `@slot` for complex dashboards to load sections independently.
- **Intercepting Routes**: Use `(.)` patterns for modals that maintain URL state.
- **Loading UI**: Always provide `loading.tsx` with high-fidelity skeletons to improve perceived performance.

## 3. SEO & Performance
- **Metadata API**: Export `generateMetadata` for dynamic pages.
- **Image Optimization**: Use `next/image` with `priority` for LCP elements.
- **Dynamic Imports**: Use `next/dynamic` for heavy client-side libraries.

## 4. API & Server Actions
- **Security**: Use Server Actions for mutations. Validate inputs using `zod`.
- **Form States**: Use `useFormStatus` and `useFormState` for seamless UX.

## Constraints
- **NO `os.environ`**: Always use a central config/settings module for env variables.
- **NO heavy logic in UI**: Keep business logic in `src/services` (Backend Tier 3).
