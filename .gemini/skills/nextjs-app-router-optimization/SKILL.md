---
description: Advanced optimization patterns for Next.js App Router (v14+). Covers SEO, Metadata API, Server Components, Caching strategies, and performance tuning.
---

# Next.js App Router Optimization

This skill guides the implementation of high-performance, SEO-optimized Next.js applications using the App Router. It focuses on leveraging Server Components, efficient data fetching, and the Metadata API.

## 1. Server Components vs Client Components

*   **Default to Server Components**: All components in `app/` are Server Components by default. Use them for data fetching, sensitive logic (environment variables), and rendering non-interactive HTML.
*   **"use client"**: Add this directive *only* at the top of comprehensive "leaf" components that require interactivity (state, effects, event listeners).
*   **Pattern: Composition**: Pass Server Components as `children` to Client Components to prevent the "waterfall" of client rendering.

```tsx
// server-layout.tsx (Server Component)
import { ClientSidebar } from './client-sidebar';
import { ServerFeed } from './server-feed';

export default function Layout() {
  return (
    <ClientSidebar>
      <ServerFeed /> {/* Passed as generic children, remains server-rendered */}
    </ClientSidebar>
  );
}
```

## 2. Advanced SEO & Metadata

Use the Metadata API for type-safe SEO management. Avoid manual `<head>` tags.

### Dynamic Metadata
Generate metadata based on route params or fetched data.

```tsx
// app/blog/[slug]/page.tsx
import { Metadata } from 'next';

export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug);
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      images: [post.coverImage],
    },
  };
}
```

### Metadata Templates
Define a `template` in `layout.tsx` to ensure consistent branding (e.g., "%s | Acme Corp").

## 3. Data Fetching & Caching

Understanding the cache mechanisms is critical.

*   **`fetch` Cache**: Next.js extends `fetch`.
    *   `force-cache` (default): Static generation (SSG-like).
    *   `no-store`: Dynamic rendering (SSR-like).
    *   `next: { revalidate: 3600 }`: Revalidation (ISR-like).

### Request Memoization
Duplicated fetch requests in the same render pass (e.g., in `generateMetadata` and `Page`) are automatically deduplicated. **Do not prop-drill data** unnecessarily; fetch it where it's needed.

## 4. Image Optimization

*   **`next/image`**: Always use for external or large assets.
*   **`priority`**: Add to the LCP (Largest Contentful Paint) image (usually the hero image) to prevent layout shifts and improve load speed.
*   **`sizes`**: Define responsive sizes to serve the correct resolution.

```tsx
<Image
  src={heroImg}
  alt="Hero"
  priority
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

## 5. Route Handlers (API)

*   Files named `route.ts` in `app/`.
*   Use standard `Request` and `Response` interfaces.
*   Can be cached. Use `export const dynamic = 'force-dynamic'` to opt-out.

```ts
// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
  const path = request.nextUrl.searchParams.get('path');
  revalidatePath(path);
  return Response.json({ revalidated: true, now: Date.now() });
}
```
