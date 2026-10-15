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
| Styling | Tailwind CSS 4, a Material Design 3 Expressive design system, glassmorphism surfaces |
| Motion | Framer Motion 14 with the shared variants in `lib/m3-motion.ts`; scroll-linked effects in CSS (`app/scroll-animations.css`) |
| Chat | Vercel AI SDK 7 (`@ai-sdk/react`), streaming from the backend `/chat/stream` |
| Data | TanStack Query for server state (`lib/query-client.ts`, `hooks/use-*.ts`) |
| Forms | React Hook Form with Zod 4 schemas |
| Auth | Firebase Auth (modular SDK 13), passkeys (WebAuthn) and Firebase App Check |
| UI primitives | Radix UI, Vaul drawers, Lucide icons |
| Tests | Jest and React Testing Library; Playwright for end-to-end tests |

## What's in the app

| Route | Content |
| :--- | :--- |
| `/` | Homepage: hero with the project gallery, "Cosa facciamo", technology, portfolio and testimonials sections |
| `/progetti`, `/chi-siamo`, `/faq` | Portfolio, company and FAQ pages |
| `/blog`, `/blog/[slug]` | Articles, defined as data in `lib/blog/posts/` and rendered by one route |
| `/privacy`, `/cookie-policy`, `/terms` | Legal pages, with company data from `lib/company.ts` |
| `/dashboard` | Client area: projects, gallery, quotes, profile and settings |
| `/admin` | Admin console: quote review, batches, price book, portfolio, testimonials, GDPR tools |
| `/auth/verify` | Completes the passwordless email (magic link) sign-in |

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

`next.config.ts` sets HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, a
restrictive `Permissions-Policy` and a referrer policy. `proxy.ts` adds the
Content Security Policy built in `lib/security/csp.ts`: dynamic routes such as
`/dashboard/*` get a strict nonce-based policy, and statically pre-rendered
pages get an allowlist policy because they can't carry a per-request nonce.

## Branding and PWA assets

The site logo is the `SydLogo` component (`components/branding/SydLogo.tsx`).
Static copies live in `public/`:

- `syd-logo.svg` and `syd-logo.png`: the lockup, used by the structured data
  (JSON-LD) of the homepage and the blog.
- `syd-icon.svg`: the square mark. `icon-192.png`, `icon-512.png` and
  `icon-maskable-512.png` are generated from it and declared in
  `public/manifest.json`.

`__tests__/public-assets.test.ts` checks that every declared icon exists, is a
real PNG and matches its declared size.

## Project structure

```text
web_client/
├── app/                 # Routes (Server Components by default), API proxy, actions
├── components/
│   ├── chat/            # Chat UI, provider, message rendering, feedback
│   ├── mobile/          # Swipe navigation between dashboard, gallery and chat
│   ├── admin/, dashboard/, quotes/, projects/, gallery/   # Feature components
│   ├── sections/        # Homepage sections
│   ├── branding/        # SydLogo
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
later. The lockfile must be regenerated with npm 10 (see
[`CONTRIBUTING.md`](../CONTRIBUTING.md)).

```bash
npm run dev:web                 # from the repo root: dev server on http://localhost:3000
cd web_client
npm run type-check              # tsc --noEmit, must report 0 errors
npm run lint                    # ESLint
npm test                        # Jest and React Testing Library
npm run test:coverage           # Jest with coverage thresholds
npm run build                   # production build
npm run test:e2e                # Playwright smoke suite (after a build)
```

The Jest setup (`jest.setup.js`) mocks every Firebase SDK module, because
JSDOM can't run the real ones. Tests follow the component implementation.

## Next steps

- End-to-end tests: [`e2e/README.md`](e2e/README.md)
- Project overview: [`../README.md`](../README.md)
