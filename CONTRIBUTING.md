# Contributing to SYD Bioedilizia

Internal engineering guide. This is a proprietary project (see [LICENSE](LICENSE));
access is limited to authorized contributors.

## Architecture in one line

Full-stack AI renovation platform with a strict **3-tier** boundary:

```
Next.js 16 (web_client)  →  FastAPI (backend_python)  →  Google ADK orchestration
        Tier 2                     Tier 3                      Tier 1
```

**Never bypass a tier.** The frontend talks only to the backend; the backend
owns all ADK/Vertex/Firebase-admin access. Per-tier rules live in the internal
architecture docs; ask a maintainer for the current architecture map.

## Prerequisites

- **Node.js 22+** and npm (frontend is an npm workspace — always `npm install`
  from the repo root, never from `web_client/`).
- **Python 3.12+** and [`uv`](https://docs.astral.sh/uv/) (backend).

## Local setup

```bash
npm install                 # from repo root (installs the web_client workspace)
cd backend_python && uv sync --all-extras
```

Copy `.env.example` to `.env` and fill in the required values before running the
backend (`load_dotenv(".env")` must run before any google-adk import — do not
reorder `main.py`).

## Running

```bash
npm run dev:web             # frontend on :3000
npm run dev:py              # backend on :8080
```

## Quality gates (run before every PR)

These mirror CI — a PR will not merge until they pass.

### Frontend (`web_client/`)
```bash
cd web_client
npm run lint               # ESLint (0 errors)
npm run type-check         # tsc --noEmit (0 errors)
npm test                   # Jest + RTL
npm run build              # production build must succeed
```

### Backend (`backend_python/`)
```bash
cd backend_python
uv run ruff check src/ main.py tests/
uv run pyright             # type gate (see "Type checking" below)
uv run pip-audit --strict --desc --ignore-vuln CVE-2026-28277
uv run pytest
```

A **pre-commit hook** (husky + lint-staged) runs ESLint/Prettier on staged
`*.{ts,tsx,json,md,css}` files and `ruff check --fix` on staged
`backend_python/**/*.py` files. Do not bypass it with `--no-verify`.

## Type checking (pyright)

The backend uses **pyright in incremental-adoption mode** (`pyrightconfig.json`).
The CI gate blocks *new* hard type errors. Roughly 186 pre-existing findings in
`src/` are baselined as warnings (a ratchet). When you touch a module, prefer to
fix its findings and — where feasible — tighten the relevant rule back to
`error`. **Do not add new blanket suppressions.**

## Commit & PR conventions

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`, `ci:`, `build:`. Scope optional, e.g. `fix(backend): …`.
- **Atomic commits** — one logical change each.
- **Golden Sync**: any change to a Pydantic model must update the matching
  TypeScript interface (1:1 parity), and vice versa.
- Keep PRs focused; include a short "what/why" and note any CORS or env changes.
- Update [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` for user-visible
  changes.

## Dependency updates

Dependabot opens grouped version-update PRs (see `.github/dependabot.yml`).

> ⚠️ **Backend (pip) note:** Dependabot raises floors in `pyproject.toml` but
> does **not** update `uv.lock`. Merging those PRs individually leaves the lock
> behind, and Cloud Run builds from `uv.lock`. Consolidate backend bumps and
> re-lock (`uv lock`) in a single PR.

> ⚠️ **Windows note:** regenerating `package-lock.json` on Windows strips Linux
> optional dependencies. Regenerate only with `--package-lock-only` or on Linux.

## Security

Do not commit secrets. Report vulnerabilities privately to the maintainers
rather than opening a public issue.
