# SYD Bioedilizia web client

The web client is a Next.js App Router application that serves the public
website of SYD Bioedilizia, the AI chat assistant, the client dashboard and the
admin console. It's installable as a Progressive Web App and designed
mobile-first. It never calls AI services directly: every request goes through
the Python backend.

## Technology

| Area | Technology |
| :--- | :--- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript 6 |
| Styling | Tailwind CSS 4, W3C DTCG + OKLCH semantic role tokens (`light` theme, WCAG 2.2 AA contrast gate, `shadow-1/2/3` elevation and `surface-inverse`) |
| Motion | Framer Motion 14 with the shared variants in `lib/m3-motion.ts`; scroll-linked effects in CSS (`app/scroll-animations.css`) |
| Chat | Vercel AI SDK 7 (`ai` 7 / `@ai-sdk/react` 4), streaming from the backend `/chat/stream` |
| Data | TanStack Query 5 for server state (`lib/query-client.ts`, `hooks/use-*.ts`) |
| Forms | React Hook Form 7 with Zod 4 schemas |
| Auth | Firebase Auth (modular SDK 13), passkeys (WebAuthn with per-device cookie gate) and Firebase App Check |
| UI primitives | Radix UI, Vaul drawers, Lucide icons |
| Tests | Jest and React Testing Library; Playwright + axe-core for end-to-end and WCAG 2.2 AA tests |

## What's in the app

| Route | Content |
| :--- | :--- |
| `/` | Homepage: `Hero` with the photo-only project gallery, `Services` ("Tecnologia al servizio del Design"), `WhatWeDo` ("Cosa facciamo") and `Testimonials` sections |
| `/progetti`, `/chi-siamo`, `/faq` | Portfolio archive, company profile and interactive FAQ (`FAQExplorer` + `CompanyContextStrip`) |
| `/blog`, `/blog/[slug]` | Articles, defined as data in `lib/blog/posts/` and rendered by one route |
| `/privacy`, `/cookie-policy`, `/terms` | Legal pages, with the company info (`lib/company-info/`, edited in `/admin/company`) |
| `/syd-bioedilizia.vcf`, `/llms.txt` | Company vCard download and AI crawler context route |
| `/auth/action` | In-app Firebase Auth action handler (`resetPassword`, `verifyEmail`, `recoverEmail`) |
| `/dashboard` | Client area: single home chat & rooms overview, `/dashboard/gallery`, `/dashboard/quotes` (confirmation cards & revision history) and `/dashboard/profile` (account security, passkeys, session revocation) |
| `/admin` | Admin console: KPI overview, `/admin/quotes` and `/admin/quotes/[projectId]` (dossier), `/admin/price-book`, `/admin/company` (9-tab company editor), `/admin/portfolio`, `/admin/testimonials`, `/admin/gdpr` |

The chat widget is available on every page. Premium actions (renders and
quotes) ask anonymous visitors to sign in.

## Talking to the backend

- **Chat**: `components/chat/ChatProvider.tsx` sends messages through
  `app/api/chat/route.ts`, a pass-through proxy that doesn't buffer the stream.
- **REST calls**: the API modules in `lib/` (`projects-api.ts`, `quotes-api.ts`,
  `admin/admin-api.ts` and others) use `NEXT_PUBLIC_API_URL`, which defaults to
  `/api/py`. The rewrite in `next.config.ts` maps `/api/py/*` to the backend's
  `/api/*`.
- **Authenticated calls**: use `fetchWithAuth` or `fetchValidated` from
  `lib/api-client.ts`. They add the Firebase ID token and, when
  `NEXT_PUBLIC_ENABLE_APP_CHECK` is `true`, the App Check token. Don't call
  `fetch` directly for backend endpoints.
- **Golden Sync**: the TypeScript types in `types/` mirror the backend Pydantic
  models one to one. Change both sides together.

## Security headers

`next.config.ts` sets HSTS, `X-Frame-Options: DENY` (`SAMEORIGIN` on `/__/auth/*` so the page can frame the proxied Firebase Auth handler), `nosniff`, a
restrictive `Permissions-Policy` (`camera=(self), microphone=(), geolocation=(), browsing-topics=()`) and a referrer policy. `proxy.ts` adds the
Content Security Policy built in `lib/security/csp.ts`: dynamic routes such as
`/dashboard/*` and `/admin/*` get a strict nonce-based policy (`'strict-dynamic'`), and statically pre-rendered
pages get an allowlist policy because they can't carry a per-request nonce.

## Branding and PWA assets

Everything brand-related is generated from [`brand/`](brand/README.md) (design
tokens, the colour-free master logo, the wordmark font) by `npm run brand:build`
at the repo root. Do not edit the outputs by hand:

- `app/brand-tokens.css`: Tailwind `@theme` colours, the `--logo-*` role
  variables and the logo tone classes.
- `lib/brand/*.generated.ts`: colours, logo artwork per variant, URL/type/size
  of every logo file. Application code imports them through `@/lib/brand`.
- `public/favicon.ico` and `public/brand/`: SVG favicon (with dark mode),
  touch/PWA/maskable icons, logo SVG/PNG for JSON-LD, default Open Graph image.

In components use `<BrandLogo variant tone />` (`components/brand/BrandLogo.tsx`).
`app/manifest.ts` and the `icons` metadata in `app/layout.tsx` read `@/lib/brand`.
`__tests__/brand-pipeline.test.ts` fails when a generated file is stale and
`__tests__/public-assets.test.ts` checks the shipped files are what they declare.

## Project structure

```text
web_client/
├── app/                 # Routes (Server Components by default), API proxy, actions
├── components/
│   ├── chat/            # Chat UI, provider, message rendering, feedback
│   ├── mobile/          # Swipe navigation between dashboard, gallery and chat
│   ├── admin/, dashboard/, quotes/, projects/, gallery/   # Feature components
│   ├── sections/        # Homepage sections
│   ├── brand/           # BrandLogo (artwork generated from brand/)
│   ├── providers/       # Auth, App Check, query client
│   └── ui/              # Shared primitives
├── hooks/               # Chat, auth, upload, data-fetching and viewport hooks
├── lib/                 # API clients, Firebase, security, motion, blog, validation
├── schemas/, types/     # Zod schemas and TypeScript types (Golden Sync)
├── e2e/                 # Playwright suites (see e2e/README.md)
├── public/              # Static assets, manifest, textures
└── proxy.ts             # Auth redirects and the Content Security Policy
```

## Setup and commands

Run `npm install` from the repository root: the project is an npm workspace and
there is a single lockfile. The root `package.json` requires Node.js 24.12 or
later. The lockfile must be updated with the npm bundled with Node 24 (npm 11, see
[`CONTRIBUTING.md`](../CONTRIBUTING.md)).

```bash
npm run dev:web                 # from the repo root: dev server on http://localhost:3000
cd web_client
npm run type-check              # tsc --noEmit, must report 0 errors
npm run lint                    # ESLint
npm test                        # Jest and React Testing Library (~210 test files)
npm run test:coverage           # Jest with coverage thresholds
npm run build                   # production build
npm run test:e2e                # Playwright smoke + WCAG 2.2 AA suite (after a build)
```

The Jest setup (`jest.setup.js`) mocks every Firebase SDK module, because
JSDOM can't run the real ones. Tests follow the component implementation.

## Next steps

- End-to-end tests: [`e2e/README.md`](e2e/README.md)
- Project overview: [`../README.md`](../README.md)
