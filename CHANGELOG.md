# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Admin console** (`/admin`, admin-only): quote inbox and dossier (client,
  request, photos and renders, revisions, item editor, approval and sending,
  review of an already sent quote), AI price book on Firestore with versions and
  a price book editor, KPI dashboard, quote batches, portfolio with uploads,
  testimonials and GDPR tools. The old Streamlit console is gone.
- **Quotes**: sequential `PRV` quote numbers, AI drafts that never overwrite the
  admin's work, PDF v2 and email templates with terms and a legal notice.
- **Transactional email outbox** (`src/services/email/`): Brevo and SMTP
  providers, retries driven by Cloud Tasks (no periodic job), dead-lettering,
  Brevo delivery events. A dead-lettered email logs `email_dead_letter` and
  triggers a Cloud Monitoring alert to the admin.
- **Observability and deploy scripts** (`backend_python/deploy/`): per-turn chat
  latency log (`chat_turn_timing`), log-based metrics, "Chat TTFT p95 > 3s" and
  "Email dead-letter" alerts, Cloud Run runtime configuration, email outbox
  infrastructure and the Vertex AI switch, documented in `deploy/README.md`.
- **Chat**: token streaming with a stream-then-verify guardrail, smooth text
  reveal, and a Gemini model registry by role (`src/core/models.py`) with no
  hardcoded model IDs. Gemini runs on Vertex AI in the `eu` multi-region.
- **Brand assets**: a clean SVG logo (`syd-logo.svg`) and PNG lockup rebuilt from
  the `SydLogo` component, regenerated 192 and 512 px PWA icons, and a 512 px
  maskable icon declared in the manifest.
- **Blog**: articles are data in `lib/blog/posts/`, rendered by one
  `/blog/[slug]` route.
- **Contract tests**: middleware order, the API error envelope, CORS headers on
  error responses, build context (`.gcloudignore` against `.dockerignore`), and
  an `EvalSet` schema test for the ADK eval files.
- **CI hardening**: least-privilege `permissions` and `concurrency` (cancel
  in-progress) on all GitHub Actions workflows; all actions pinned to full
  commit SHA.
- **Frontend CI**: production `next build` step now runs in `frontend-checks`.
- **Backend type gate**: pyright added as a dev dependency and CI step, in
  incremental-adoption mode (`pyrightconfig.json`) — blocks new hard type
  errors, with ~186 pre-existing findings baselined as warnings.
- **Pre-commit**: `ruff check --fix` now runs on staged `backend_python/**/*.py`
  files via lint-staged (previously TypeScript-only).
- Repository governance: `LICENSE` (proprietary), `CONTRIBUTING.md`,
  `.github/CODEOWNERS`, and this `CHANGELOG.md`.

### Changed
- **Middleware order**: `RequestID`, `SecurityHeaders`, `CORS`,
  `GlobalErrorCatcher`, `AppCheck`, `Idempotency`, `Metrics`. App Check
  rejections and unexpected 500 errors now carry `X-Request-ID` and the security
  headers, and CORS headers, so a browser can read the error envelope.
- **Performance**: backend cold start from about 16 s to about 5 s, warm-up when
  the chat opens, Vercel functions in Europe.
- **Gallery metadata editor**: `POST /api/update-file-metadata` is mounted under
  `/api` (reachable through the `/api/py/*` rewrite) and the hook uses
  `fetchWithAuth`, which adds the App Check token. It called
  `undefined/update-file-metadata` before.
- **ADK evals**: the eval sets use the snake_case `EvalSet` schema that
  `google-adk` 2.x validates, and `run_evals.py` exits with a non-zero code on
  any error.
- **Frontend**: Node.js 24.12 baseline, Firebase JS SDK 13, Framer Motion 14,
  AI SDK 7.
- **Docker**: backend image now builds with `uv sync --no-dev --frozen` — dev
  tooling (pytest/ruff/pyright/pip-audit) is excluded from the production image
  and the build fails on `uv.lock` drift.

### Removed
- **Dead code** (issue #480): the CAD/DXF engine and the `ezdxf` dependency, the
  legacy prompt builder (`src/prompts/builder.py`, `system_instruction.py`,
  `system_prompts.py`, `components/tools.py`), `src/models/reasoning.py`,
  `src/utils/async_utils.py` and a LangGraph-era test fixture.
- **Debug and test routes** (`/api/test/*`, `/api/debug/logs`) and the TestSprite
  suite.
- **n8n and Supabase** (Phase 129): the agent tool `trigger_n8n_webhook`, the
  legacy chat lead form / `POST /api/submit-lead`, the inbound
  `POST /webhooks/n8n` callback (no caller; it bypassed App Check), the
  `N8N_*` settings, `DeliveryError`, and the `n8n/`, `n8n_workflows/` and
  `supabase/` folders. Quote emails already run on the native transactional
  outbox (Phase 128).

### Security
- **Model Armor** blocked nothing in production: the verdict was read with
  `"MATCH_FOUND" in str(enum)`, and `str()` of a proto-plus enum returns its
  number. It now compares the enum name.
- **Session and file ownership**: `/chat/stream` and `/api/upload/image` return
  403 for another user's session, ADK tools use the identity from
  `tool_context`, renders are blocked for anonymous users and `storage.rules`
  allow only the project owner. The rules are tested against the emulators in CI.
- Dependabot queue drained; `js-yaml` moderate DoS (GHSA-h67p-54hq-rp68)
  resolved via a scoped override; backend `click` command-injection
  (PYSEC-2026-2132) resolved via targeted re-lock. `npm audit` and
  `pip-audit --strict` both clean.

## [4.4.6] — 2026-06-29

### Added
- Model Armor audit & hardening: template `syd-guardrail-v1` verified live in
  `europe-west1` (7 filters + always-on CSAM), multi-language detection, and
  audit-trail logging.

### Fixed
- Corrected `MODEL_ARMOR_LOCATION` in `.env.example` (`us-central1` →
  `europe-west1`) to match the deployed template.

## [4.4.5] — 2026-06-06

### Security
- Resolved 80 Dependabot alerts across the Python (`uv.lock`) and npm
  (`package-lock.json`) trees, including critical `protobufjs` and `google-adk`
  advisories.

### Changed
- Migrated to `google-adk` 2.x (required to obtain `starlette ≥ 1.0.1`).
- Renamed webhook HMAC headers `X-N8N-*` → `X-SYD-*` (vendor-neutral).

## [4.4.3] — 2026-05-10

### Added
- RAG pipeline completion: full Prezzario Lazio 2023 ingestion (2,859 unique
  articles) into the `prezzario` Pinecone namespace.

---

[Unreleased]: https://github.com/ionmidori/SYDBioedilizia/compare/v4.4.6...HEAD
[4.4.6]: https://github.com/ionmidori/SYDBioedilizia/compare/v4.4.5...v4.4.6
[4.4.5]: https://github.com/ionmidori/SYDBioedilizia/compare/v4.4.3...v4.4.5
[4.4.3]: https://github.com/ionmidori/SYDBioedilizia/releases/tag/v4.4.3
