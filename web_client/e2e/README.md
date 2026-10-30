# E2E suites

Two independent Playwright suites.

| Suite | Config | Needs | Runs in CI as |
|---|---|---|---|
| Public smoke | `playwright.config.ts` | nothing | job `smoke` |
| Authenticated | `playwright.emulator.config.ts` | Firebase emulators + JDK | job `authed` |

## Public smoke (`e2e/smoke.spec.ts`)

Assertion-light merge gate over the static public routes. Fast, no secrets.

```bash
cd web_client
npm run build
npm run test:e2e
```

## Authenticated suite (`e2e/authed/**`)

Covers the flows that unit tests structurally cannot: chat history
reconciliation across a reload, the quotes area, and chat attachment upload.
These are the seams that produced #125/#127/#128, #231, #232 and #239.

### Admin console (`e2e/authed/admin-quotes.spec.ts`)

The seeded user also gets the `role=admin` custom claim (`setCustomClaims` in
`auth.setup.ts`, the emulator equivalent of `scripts/set_admin_claim.py`), so the
real proxy and layout gate run. The FastAPI backend is replaced by a small
stateful fake inside the spec that enforces `If-Match` (409 when stale) and
`Idempotency-Key`; backend behaviour is covered by pytest. A user without the
claim is redirected away (proxy, UX only: the backend is the authority).

### Prerequisites

1. **A JDK** — the Firestore emulator is a JVM binary. Any JDK 11+ works; it
   does not need to be on `PATH` permanently, just for the run.
2. **`firebase-tools`** — invoked through `npx`, deliberately *not* added to
   `package.json`: it is a very large dependency tree and this repo has strict
   lockfile rules (see `.claude/rules/frontend.md`).

### Running it

```bash
# from the repo root — firebase.json and firestore.rules live here
cd web_client && npm run build:e2e && cd ..

npx --yes firebase-tools@14 emulators:exec \
  --project demo-syd-e2e --only auth,firestore \
  "npm --prefix web_client run test:e2e:auth"
```

On Windows, if the JDK is not on `PATH`:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.11+10"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

### How it fits together

- **`demo-` project id.** `demo-syd-e2e` makes the emulator suite fully
  offline: no credentials are resolved and nothing can reach the real
  `chatbotluca-a8a73` project by accident.
- **Its own build.** `NEXT_PUBLIC_*` values are inlined at build time, so
  emulator mode cannot be switched on an existing artifact. `build:e2e` emits a
  separate `.next-e2e` (via `NEXT_DIST_DIR`) so it never clobbers `.next`.
- **Real security rules.** The emulator loads the production `firestore.rules`.
  History is seeded in the user's chat (`sessions/e2e-user-chat`, with its
  owner) — the id the faked GET /api/me/chat returns (Phase 139: one chat per
  user) — so the suite exercises the real rules (the parent session must exist
  and be the user's) rather than a permissive test ruleset.
- **Seeding bypasses rules** via the emulator's `Authorization: Bearer owner`
  admin token, because `messages` are backend-only writes in production.
- **The `auth-token` cookie is minted by the setup project.**
  `app/actions/auth-session.ts` sets it with `secure: NODE_ENV === 'production'`
  and `next start` is always production, so over plain http on loopback the
  browser drops it and `proxy.ts` would bounce every `/dashboard/*` request.
  `auth.setup.ts` writes it explicitly with `secure: false`. This is sound:
  `proxy.ts::isTokenExpired` only base64-decodes the payload to read `exp` — it
  never verifies the signature (that is the Python backend's job).
- **Nothing reaches the real backend.** `next.config.ts` bakes the
  `/api/py/*` → Cloud Run rewrite into production builds, so `fixtures/authed-test.ts`
  installs a catch-all route that fails loudly (599) on any unstubbed call, plus
  a hard block on the Cloud Run host.

### Gotchas worth knowing

- **`alert()` blocks the page.** Upload validation errors surface via
  `window.alert`. Use the `collectDialogs()` helper (a registered
  `page.on('dialog')` that dismisses immediately) — waiting with
  `page.waitForEvent('dialog')` deadlocks the very call that opened it.
- **The login dialog needs a retried dispatch.** `OPEN_LOGIN_MODAL` is handled
  by a client component; an event fired before hydration is silently lost.
- **The test password must satisfy `lib/validation/auth-schema.ts`** (uppercase,
  digit, special char) or the form never submits and never reaches the emulator.
- **`window.open` uses `noopener`,** so the popup is a detached context whose
  URL Playwright cannot read reliably. Assert on the intercepted request instead.
- **Don't assert the thinking indicator** on a route fulfilled in one shot —
  `streaming` may last a single frame. Pass `delayMs` to `chatStreamHandler`.
- A benign `upstream image response failed ... 412` line appears in the web
  server log: `next/image` trying to fetch the fake fixture asset URL. Harmless.
