# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **One home chat per user & multi-room projects** (Phases 138–139): a single
  persistent home conversation per user (`users/{uid}.chat_id`), guest-to-account
  conversation transfer on sign-in (`/api/guest-claim`), rooms subcollection
  (`projects/{id}/rooms`) with per-room briefs (`room_brief.py`), background photo
  measurement (`room_photo_vision.py`), room-aware history compaction
  (`compaction.py`, threshold 13k tokens), and ADK tools `select_room`,
  `assign_media_to_room`, `rename_room` and `get_room_context`.
- **Deterministic quote engine & confirmation cards** (Phase 140): typed room
  intervention specifications (`RoomInterventionSpec`) expanded in `Decimal`
  against the assembly library (`renovation_assemblies.json` v2.0.0) and the live
  price book (`intervention_expansion.py`), interactive chat confirmation cards
  for per-item measures and works (`PUT /api/quote/{id}/confirmation-cards`)
  that recalculate drafts without calling the LLM, code-enforced explicit client
  consent before sending (`send_consent.py`), quote state-machine step logging
  (`quote_step.py` / `QuoteStepPlugin`), and an approval diff ledger
  (`learning_ledger`) recorded in the approval transaction.
- **Central company profile ("scheda società")** (Phase 141): single source of
  truth on Firestore (`app_config/company_info`, seeded from
  `company_info.seed.json` with 121 served municipalities) with a 9-tab admin
  editor (`/admin/company`) supporting ETag concurrency and version history,
  public and admin endpoints, dynamic injection into all four ADK agents,
  `get_company_info` and `check_service_area` tools, clickable chat contact links
  and downloadable vCard (`/syd-bioedilizia.vcf`).
- **Brand system & light theme** (WCAG 2.2 AA): W3C DTCG + OKLCH semantic role
  tokens (`web_client/brand/`), build-time contrast gate, generated CSS/TS/backend
  brand assets (`npm run brand:build`) for the site, quote emails and PDF,
  `Playfair Display` / `Lato` / `Red Hat Display` (`wordmark`) typography, and a
  blocking `axe-core` WCAG 2.2 AA audit in both Playwright CI suites (`smoke` and
  `authed`).
- **Authentication & GDPR lifecycle hardening**: enforced password complexity
  checklist, exponential lockout and anti-enumeration error mapping, in-app
  `/auth/action` handlers (`resetPassword`, `verifyEmail`, `recoverEmail`),
  global session revocation (`POST /api/users/me/sessions/revoke`), per-device
  passkey enrollment cookie (`syd_passkey_device`), and automated GDPR account
  inactivity and retention pipeline (`/internal/lifecycle/run`).
- **Pre-PR preflight & telemetry v2**: `npm run preflight` (and `preflight:fast`)
  running CI parity checks on changed areas, structured log `severity` and
  `session_ref` hashing, `chat_turn_failed` / `Cloud Run 5xx` / `/health` uptime
  alerts, and `infra/monitoring/setup_telemetry.ps1` provisioning a BigQuery
  telemetry sink (`syd_telemetry`), 11 token/latency/tool/cost distribution
  metrics and the Cloud Monitoring KPI dashboard (`syd-agents-dashboard.json`).
- **Admin console** (`/admin`, admin-only): quote inbox and dossier (client,
  request, photos and renders, revisions, item editor, approval and sending,
  review of an already sent quote), AI price book on Firestore with versions and
  a price book editor, KPI dashboard, portfolio with uploads,
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
  error responses, build context (`.gcloudignore` against `.dockerignore`), AST
  log-ID guard (`test_log_no_ids.py`), shared Decimal money vectors, and an
  `EvalSet` schema test for the ADK eval files.
- **CI hardening**: least-privilege `permissions` and `concurrency` (cancel
  in-progress) on all GitHub Actions workflows; all actions pinned to full
  commit SHA.
- **Frontend CI**: production `next build` step now runs in `frontend-checks`.
- **Backend type gate**: pyright runs in `basic` mode (`pyrightconfig.json`) with
  every bug-catching rule ratcheted to `error` and zero findings in `src/`.
- **Pre-commit**: `ruff check --fix` now runs on staged `backend_python/**/*.py`
  files via lint-staged (previously TypeScript-only).
- Repository governance: `LICENSE` (proprietary), `CONTRIBUTING.md`,
  `.github/CODEOWNERS`, and this `CHANGELOG.md`.

### Changed
- **Runtime**: backend production Docker image and CI now run **Python 3.15**
  (`python:3.15-slim-trixie`, `.python-version`), with ADK evaluations isolated
  in `backend_python/.venv-eval` on Python 3.14 (`scripts/run-evals.mjs`).
- **Website & portfolio UX**: photo-only homepage project carousel with
  on-demand description and `"Esempio"` badges (`ProjectCard.tsx`), unified
  floating `ChatToggleButton` and `openChat()` helper, revamped `/faq` with
  `FAQExplorer` and `CompanyContextStrip`, and working hours in the footer.
- **Render latency**: architect vision input downscaled to 1024 px with a 12 s
  clean fallback preserving user instructions, removing 180 s I2I render hangs.
- **Middleware order**: `RequestID`, `SecurityHeaders`, `CORS`,
  `GlobalErrorCatcher`, `AppCheck`, `Idempotency`, `Metrics`. App Check
  rejections and unexpected 500 errors now carry `X-Request-ID` and the security
  headers, and CORS headers, so a browser can read the error envelope.
- **Performance**: backend cold start from about 16 s to about 5 s, bounded
  per-step warm-up when the instance starts, Vercel functions in Europe.
- **Gallery metadata editor**: `POST /api/update-file-metadata` is mounted under
  `/api` (reachable through the `/api/py/*` rewrite), restricted to the caller's
  project media, and the hook uses `fetchWithAuth`, which adds the App Check token.
- **ADK evals**: the eval sets use the snake_case `EvalSet` schema that
  `google-adk` 2.x validates (including 15 multi-room sets under
  `tests/evals/multi_room/`), and `run_evals.py` exits with a non-zero code on
  any error.
- **Frontend**: Node.js 24.12 baseline (npm 11 lockfile), Firebase JS SDK 13,
  Framer Motion 14, AI SDK 7.
- **Docker**: backend image builds with `uv sync --no-dev --locked` — dev
  tooling (pytest/ruff/pyright/pip-audit) is excluded from the production image
  and the build fails on `uv.lock` drift.

### Removed
- **Quote batches** (Phase 138): quotes are submitted directly for the home
  project (`batch_id`, batch endpoints and batch admin views removed).
- **Passwordless Magic Link & Apple sign-in**: removed in favor of hardened
  Email/Password, Google OAuth (with same-domain `/__/auth/*` proxy and
  `X-Frame-Options: SAMEORIGIN` on the auth handler) and WebAuthn passkeys.
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
- **Log identifier masking**: raw project/session UUIDs and user UIDs removed
  from application log calls, masked as `[ID]` by `JsonFormatter` and guarded by
  `test_log_no_ids.py`; conversations correlate through `session_ref`.
- **Model Armor** blocked nothing in production: the verdict was read with
  `"MATCH_FOUND" in str(enum)`, and `str()` of a proto-plus enum returns its
  number. It now compares the enum name.
- **Session and file ownership**: `/chat/stream` and `/api/upload/image` return
  403 for another user's session, ADK tools use the identity from
  `tool_context`, renders are blocked for anonymous users and `storage.rules`
  allow only the project owner. The rules are tested against the emulators in CI.
- Dependabot queue drained; `js-yaml`, `opentelemetry`, `pyasn1`, `pypdf`,
  `joserfc`, `authlib`, `dnspython`, `msgpack`, `filelock`, `pillow`, `certifi`,
  `next` and `click` advisories resolved. `npm audit` and `pip-audit --strict`
  both clean.

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
