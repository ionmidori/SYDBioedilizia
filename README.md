# SYD Bioedilizia — Website & AI Renovation Assistant

Website and AI platform of **SYD Bioedilizia S.r.l.**, a renovation company based in Rome.
It combines a public website, an AI chat assistant that helps clients with renovation
requests (triage, design renders, quotes), a private client area and an internal admin console.

Live: https://sydbioedilizia.vercel.app

---

## Architecture

The codebase is an npm workspace monorepo with three tiers. The frontend never calls AI
services directly: every request goes Frontend → Backend → ADK agents.

| Tier | What | Where |
| :--- | :--- | :--- |
| **1 — AI orchestration** | Google ADK multi-agent system: a `syd_orchestrator` router delegating to `triage`, `design` and `quote` sub-agents | `backend_python/src/adk/` |
| **2 — Frontend** | Next.js App Router site, chat UI, client dashboard, admin console | `web_client/` |
| **3 — Backend** | FastAPI service: chat streaming (SSE), REST API, persistence, PDF, notifications | `backend_python/` |

Chat flow: `ChatProvider.tsx` (AI SDK) → `app/api/chat/route.ts` (proxy) → `main.py` `/chat/stream` → ADK `Runner`.

---

## What the platform does

**Public website** (`web_client/app/`)
- Homepage, `/progetti` (portfolio), `/chi-siamo`, `/faq`, `/blog` (8 articles), legal pages (privacy, cookie policy, terms) and a cookie consent banner.

**AI chat assistant** (`backend_python/src/adk/`)
- **Triage**: analyses text, photos and videos of the space (video trimming on the client before upload).
- **Design**: generates photorealistic renders of the renovated room.
- **Quote**: builds draft quotes from the internal price book and the **Prezzario Regione Lazio 2023**, retrieved via RAG; can fetch market prices through Perplexity.
- Premium actions (renders, quotes) require login; anonymous users are asked to sign in.
- Optional LLM guardrails via **Google Cloud Model Armor** on input and output of the root agent.

**Client area** (`/dashboard`)
- Projects (one room = one project), files, render gallery, quotes, profile and settings.
- Sign-in with Firebase Auth, including **passkeys (WebAuthn)**.

**Admin console** (`/admin`)
- Quote review and approval (human in the loop), price book, portfolio,
  testimonials, GDPR tools and a KPI dashboard.
- Approved quotes are rendered to PDF (ReportLab) and delivered by email.

**Email**
- Transactional outbox (`backend_python/src/services/email/`): admin notification on new quote
  requests and quote delivery are recorded with the business change and sent via Brevo or SMTP,
  with retries, dead-lettering and Brevo delivery events. Dispatch runs on Cloud Tasks
  (`backend_python/deploy/email-outbox.sh`). A dead-lettered email triggers a Cloud Monitoring
  alert to the admin (`backend_python/deploy/observability/`).

---

## Tech stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Framer Motion, Vercel AI SDK 7, TanStack Query, React Hook Form, Zod 4, Firebase JS SDK 13 |
| **Backend** | Python ≥ 3.12 (`uv`), FastAPI, Pydantic v2, Firebase Admin, ReportLab, slowapi |
| **AI** | Google ADK 2.x, Gemini via `google-genai` — defaults: `gemini-3.5-flash-lite` (agents), `gemini-3.8-flash` (vision), `gemini-3.1-flash-image-preview` (renders); models are configurable per role in `src/core/config.py` |
| **RAG** | Pinecone (index `syd-knowledge`) with integrated inference `multilingual-e5-large` and reranker `bge-reranker-v2-m3` |
| **Data & auth** | Firebase Auth, Firestore, Cloud Storage, App Check |
| **Hosting** | Vercel (frontend), Google Cloud Run `europe-west1` (backend), Cloud Tasks (email outbox) |

---

## Security

- Firebase **App Check** middleware and security headers on every backend response (errors included, with CORS answering outside App Check so browsers can read error envelopes); **CSP** on the frontend with a strict nonce policy for dynamic routes (`web_client/lib/security/csp.ts`).
- Firestore and Storage security rules, with rule tests in CI (`tests/rules/`).
- Model Armor guardrails (configurable fail-open / fail-closed).
- HMAC-signed webhooks with timestamp, rate limiting on API routes.
- Pydantic models mirrored 1:1 by TypeScript types ("Golden Sync").
- Dependabot, CodeQL and dependency audits (`npm audit`, `pip-audit`) on `main`.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Local development

Requirements: Node.js `^24.12`, Python ≥ 3.12 with [`uv`](https://docs.astral.sh/uv/).

```bash
npm install            # from the repo root (npm workspaces)
npm run dev:web        # frontend  → http://localhost:3000
npm run dev:py         # backend   → http://localhost:8080
```

Environment variables are read from `.env` files (see `backend_python/src/core/config.py` for the backend settings).

For the backend alone you can also run `uv sync --extra dev` and
`uv run uvicorn main:app --reload --port 8080` from `backend_python/`.

### Tests and checks

```bash
cd web_client && npm run type-check     # TypeScript
cd web_client && npm test               # Jest + React Testing Library
cd backend_python && uv run pytest      # Pytest
cd backend_python && uv run pyright src/
npm run eval:run                        # ADK agent evaluations (needs GOOGLE_API_KEY)
```

End-to-end tests use Playwright against the Firebase Emulator Suite — see [web_client/e2e/README.md](web_client/e2e/README.md).
Backend test details: [backend_python/tests/README.md](backend_python/tests/README.md).

### CI (GitHub Actions)

Frontend checks, backend tests, E2E smoke, Firestore + Storage rules tests, security audit, semantic PR titles and Dependabot auto-merge (`.github/workflows/`).

---

## Deployment

- **Frontend**: Vercel, from `web_client/`.
- **Backend**: Google Cloud Run (`syd-brain`, `europe-west1`), built by Cloud Build on push to `main`; health check at `/health`. Runtime settings, the email outbox infrastructure and the alerts are applied by the scripts in `backend_python/deploy/` (see [its README](backend_python/deploy/README.md)).

---

## Documentation

| Document | Content |
| :--- | :--- |
| [backend_python/README.md](backend_python/README.md) | Backend overview, middleware stack, structure, setup |
| [backend_python/deploy/README.md](backend_python/deploy/README.md) | Cloud Run, email outbox, Vertex AI and alert scripts |
| [backend_python/scripts/README.md](backend_python/scripts/README.md) | Manual maintenance and ingestion scripts (in Italian) |
| [backend_python/tests/README.md](backend_python/tests/README.md) | Backend tests and contract tests |
| [backend_python/tests/evals/README.md](backend_python/tests/evals/README.md) | ADK agent evaluations |
| [web_client/README.md](web_client/README.md) | Frontend overview, routes, API access, branding |
| [web_client/e2e/README.md](web_client/e2e/README.md) | Playwright suites |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, quality gates, commit and dependency rules |
| [SECURITY.md](SECURITY.md) | Security architecture and vulnerability reporting |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes |

---

## License

Proprietary — © 2026 SYD Bioedilizia S.r.l. All rights reserved. See [LICENSE](LICENSE).
