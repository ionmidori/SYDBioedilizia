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
- Homepage, `/progetti` (portfolio), `/chi-siamo`, `/faq`, `/blog` (8 articles), legal pages (privacy, cookie policy, terms), `/syd-bioedilizia.vcf` (vCard) and a cookie consent banner — with company data served from the central company profile (`app_config/company_info`).

**AI chat assistant** (`backend_python/src/adk/`)
- **One home chat per user**: a single conversation per user (`users/{uid}.chat_id`) organized by rooms (`rooms` subcollection) with per-room briefs, background photo measurement and history compaction.
- **Triage**: analyses text, photos and videos of the space (video trimming on the client before upload).
- **Design**: generates photorealistic renders of the renovated room.
- **Quote**: compiles typed intervention specifications (`RoomInterventionSpec`), deterministically expanded in `Decimal` against the live price book and the **Prezzario Regione Lazio 2023** (Pinecone RAG), with interactive measure and work confirmation cards in chat; can fetch market prices through Perplexity.
- **Company info**: answers questions on contacts, hours, service area (121 municipalities), works and policies strictly from the company profile.
- Premium actions (renders, quotes) require login; anonymous users are asked to sign in on confirmation, and guest conversations transfer into the user's account on login.
- Optional LLM guardrails via **Google Cloud Model Armor** on input and output across all agents (`syd_orchestrator`, `triage`, `design`, `quote`).

**Client area** (`/dashboard`)
- Home project overview (rooms, files, render gallery, house quote with interactive confirmation cards and revision history), profile and account security (password management, session revocation, **WebAuthn passkeys**).

**Admin console** (`/admin`)
- Quote inbox and dossier (human-in-the-loop review, approval, revisions and learning ledger), price book with assembly guards, company profile editor (`/admin/company`, 9 tabs with ETag concurrency and version history), portfolio, testimonials, GDPR & account lifecycle tools and a KPI dashboard.
- Approved quotes are rendered to PDF (ReportLab) using generated brand tokens and delivered by email.

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
| **Frontend** | Next.js 16, React 19, TypeScript 6, Tailwind CSS 4 (W3C DTCG + OKLCH brand tokens, light theme, WCAG 2.2 AA), Framer Motion 14, Vercel AI SDK 7 (`ai` 7 / `@ai-sdk/react` 4), TanStack Query 5, React Hook Form 7, Zod 4, Firebase JS SDK 13 |
| **Backend** | Python ≥ 3.12 (`3.15` in Docker and `.python-version`, managed with `uv`), FastAPI, Pydantic v2, Firebase Admin, ReportLab, slowapi |
| **AI** | Google ADK 2.x, Gemini via `google-genai` — defaults: `gemini-3.5-flash-lite` (chat fallback), `gemini-3.8-flash` (vision; also `MODEL_QUOTE` and `MODEL_INSIGHT` in production on Vertex AI `eu`), `gemini-3.1-flash-image-preview` (`gemini-3.1-flash-image` on Vertex AI `eu`); models are configurable per role in `src/core/config.py` |
| **RAG** | Pinecone (index `syd-knowledge`) with integrated inference `multilingual-e5-large` and optional reranker `bge-reranker-v2-m3` |
| **Data & auth** | Firebase Auth, Firestore, Cloud Storage, App Check |
| **Hosting & ops** | Vercel (frontend), Google Cloud Run `europe-west1` (backend), Cloud Tasks (email outbox), Cloud Logging → BigQuery + Cloud Monitoring (`infra/monitoring/`) |

---

## Security

- Firebase **App Check** middleware and security headers on every backend response (errors included, with CORS answering outside App Check so browsers can read error envelopes); **CSP** on the frontend with a strict nonce policy for dynamic routes (`/dashboard/*`, `/admin/*`, see `web_client/lib/security/csp.ts`).
- Firestore and Storage security rules, with rule tests in CI (`tests/rules/`).
- Model Armor guardrails across all ADK agents (configurable fail-open / fail-closed).
- Authenticated provider webhooks and Cloud Tasks OIDC verification for the transactional email outbox; rate limiting on API routes.
- Structured JSON logging with automatic PII redaction and UUID masking (`session_ref` hashing).
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
npm run preflight                       # full pre-PR CI parity check on changed areas
cd web_client && npm run type-check     # TypeScript
cd web_client && npm test               # Jest + React Testing Library
cd backend_python && uv run pytest      # Pytest (~3,500 offline unit & contract tests)
cd backend_python && uv run pyright
npm run eval:run                        # ADK agent evaluations (needs GOOGLE_API_KEY or Vertex ADC)
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
| [web_client/brand/README.md](web_client/brand/README.md) | W3C DTCG design tokens, OKLCH contrast gate and asset generation pipeline |
| [web_client/PRODUCT.md](web_client/PRODUCT.md) | Product positioning, audience, UX principles and brand commitments |
| [web_client/e2e/README.md](web_client/e2e/README.md) | Playwright suites |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, quality gates, commit and dependency rules |
| [SECURITY.md](SECURITY.md) | Security architecture and vulnerability reporting |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes |

---

## License

Proprietary — © 2026 SYD Bioedilizia S.r.l. All rights reserved. See [LICENSE](LICENSE).
