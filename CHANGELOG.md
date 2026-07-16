# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- **Docker**: backend image now builds with `uv sync --no-dev --frozen` — dev
  tooling (pytest/ruff/pyright/pip-audit) is excluded from the production image
  and the build fails on `uv.lock` drift.

### Security
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
