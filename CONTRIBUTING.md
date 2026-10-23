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
owns all ADK/Vertex/Firebase-admin access. The per-tier rules live in
[`.claude/rules/backend.md`](.claude/rules/backend.md) and
[`.claude/rules/frontend.md`](.claude/rules/frontend.md). Each tier also has a
README: [`backend_python/README.md`](backend_python/README.md) and
[`web_client/README.md`](web_client/README.md).

## Prerequisites

- **Node.js 24.12+** (`engines.node` `^24.12.0`, required by firebase 13) and
  npm 10 for lockfile changes (frontend is an npm workspace — always `npm install`
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

### One command: `npm run preflight`
From the repo root, on your work branch:
```bash
npm run preflight                 # what CI runs, only for the areas your branch touches
npm run preflight:fast            # while working: lint + types + tests (no coverage, build, audit)
npm run preflight -- --only fe-types,be-ruff   # re-run just the steps that failed
npm run preflight -- --list       # show the plan without running it
```
It picks frontend and/or backend from the changed files (same path filters as CI),
runs cheap checks before tests and the build, and prints one line per step. For a
failure it shows only the tail of the output plus the path of the full log. It also
warns about things CI cannot see: uncommitted files, secrets in the diff, a package
lock written by npm other than 10, a Pydantic model changed without its TypeScript
type, and agent/prompt changes whose evals (`npm run eval:run`, needs
`GOOGLE_API_KEY`) CI never runs. E2E (Playwright) and the Docker image build are left
to CI. `npm run test:preflight` checks the script against the workflows and fails
when their commands drift apart.

The steps it runs are listed individually below.

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

The backend runs **pyright in `basic` mode** over `src/` and `main.py`
(`pyrightconfig.json`). The rules that catch real bugs (`reportArgumentType`,
`reportAttributeAccessIssue`, `reportCallIssue`, `reportReturnType`, the
`reportOptional*` family, `reportMissingImports` and others) are set to
`error`, and `src/` currently reports no findings. The CI gate fails on any new
error. **Don't add blanket suppressions**; fix the type, or narrow the
suppression to one line with a reason.

Ruff has a ratchet too: don't add a new `# noqa: BLE001`, and narrow the
existing ones when you touch a module (the policy is in `pyproject.toml`).

## Commit & PR conventions

- **Conventional Commits**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test` and `chore`. Scope optional, e.g. `fix(backend): …`.
- **Atomic commits** — one logical change each.
- **Golden Sync**: any change to a Pydantic model must update the matching
  TypeScript interface (1:1 parity), and vice versa.
- Pull request titles must use one of those types: the `Validate PR title` CI
  check rejects any other, including `ci` and `build`. Use `chore(ci): …` for
  workflow changes.
- Keep PRs focused; include a short "what/why" and note any CORS or env changes.
- A change to a script in `backend_python/deploy/` that touches Google Cloud
  isn't applied by CI: say in the PR which command to run after the merge.
- Update [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` for user-visible
  changes.

## Dependency updates

Dependabot opens grouped version-update PRs (see `.github/dependabot.yml`).

> ⚠️ **Backend note:** the backend is managed with `uv`, and Cloud Run builds
> from `uv.lock` with `--locked`. Dependabot uses the `uv` ecosystem for
> `backend_python/`, so its PRs update the lock; whenever you edit
> `pyproject.toml` yourself, run `uv lock` and commit `uv.lock` in the same PR.
> CI runs `uv lock --check` and fails on a stale lock.

> ⚠️ **Frontend lockfile note:** there is one `package-lock.json`, at the
> repository root, and it must be regenerated with **npm 10** (CI pins it).
> npm 11, which ships with Node 24, silently prunes optional cross-platform
> dependencies on Windows and CI then fails at `npm ci`. Use
> `npx -y npm@10 install --package-lock-only`, keep the 4-space indentation, and
> check that the diff only touches the bumped package. The details are in
> [`.claude/rules/frontend.md`](.claude/rules/frontend.md).

## Security

Do not commit secrets. Report vulnerabilities privately to the maintainers
rather than opening a public issue.
