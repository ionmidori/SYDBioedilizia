# Dependabot Remediation — Tracking & Runbook

**Status:** open · **Owner:** maintainer · **Last updated:** 2026-06-26

GitHub reported **4 vulnerabilities on the default branch** (`main`): **1 high, 3 moderate**.
This document tracks remediation and the systemic controls added so the backlog
does not recur.

> **Why the exact CVE list isn't transcribed here:** the Dependabot *alerts*
> feed is only available from the repository Security tab
> (`https://github.com/ionmidori/SYDBioedilizia/security/dependabot`). It is not
> exposed by the tooling used to prepare this intervention, and several pinned
> versions in `backend_python/uv.lock` are newer than what could be verified
> offline. To avoid mis-attributing advisories, confirm the 4 alerts from the
> dashboard and fill the table below.

## Alert ledger (confirm from dashboard)

| # | Severity | Package | Ecosystem / manifest | Advisory (GHSA/CVE) | Fixed-in | Status |
|---|----------|---------|----------------------|---------------------|----------|--------|
| 1 | High     | _TBD_   | _TBD_                | _TBD_               | _TBD_    | open   |
| 2 | Moderate | _TBD_   | _TBD_                | _TBD_               | _TBD_    | open   |
| 3 | Moderate | _TBD_   | _TBD_                | _TBD_               | _TBD_    | open   |
| 4 | Moderate | _TBD_   | _TBD_                | _TBD_               | _TBD_    | open   |

## Known / confirmed offline

- **`js-yaml` (moderate, dev-only)** — root `package-lock.json`, pulled
  transitively via `jest` → `@istanbuljs/load-nyc-config` and `gray-matter`
  (`GHSA-h67p-54hq-rp68`, quadratic-complexity DoS in merge-key handling).
  Test-time tooling only; not shipped to production. `npm audit` reports 19
  affected paths but a single advisory. Remediate via the Dependabot
  `root-tooling` group PR (a clean non-breaking `js-yaml` bump, or dropping the
  unused root `jest` chain if it is stale).

## Manifests in scope (and their audit coverage)

| Manifest | Ecosystem | Lockfile committed | CI audit gate |
|----------|-----------|--------------------|---------------|
| `backend_python/` (`pyproject.toml` + `uv.lock`) | pip/uv | ✅ | ✅ `pip-audit --strict` (`backend-tests.yml`) |
| `web_client/` (`package.json`) | npm | ❌ (gitignored) | ✅ `npm audit --audit-level=high` (`frontend-checks.yml`) |
| `/` (`package-lock.json`) | npm | ✅ | ✅ **new** `security-audit.yml` (prod, high) |
| `admin_tool/requirements.txt` | pip | ❌ | ✅ **new** `security-audit.yml` (`pip-audit`) |

## Controls added in this intervention

1. **`.github/dependabot.yml`** — scheduled, grouped weekly version-update PRs
   for all five ecosystems (backend pip, admin_tool pip, web_client npm, root
   npm, github-actions). Grouping mirrors the team's "consolidated bumps".
2. **`.github/workflows/security-audit.yml`** — new CI gate for the two
   previously-unguarded manifests (root npm prod deps + `admin_tool` pip-audit),
   plus a weekly cron safety net.
3. **`admin_tool/requirements.txt`** — added minimum version floors; flagged
   `streamlit-authenticator==0.2.3` as a manual-only upgrade (legacy PyJWT
   constraint, breaking API change).

## Runbook — closing the 4 alerts

1. Open the Dependabot dashboard and fill the **Alert ledger** above.
2. For each alert, prefer the auto-generated Dependabot PR. If none exists,
   bump the offending package in its manifest to `Fixed-in` (or later).
3. `web_client` has **no committed lockfile** → Dependabot can only see the
   `package.json` ranges. Commit `web_client/package-lock.json` so alerts pin to
   exact resolved versions and `npm ci` in CI is reproducible.
4. Re-run `security-audit.yml` (and the existing backend/frontend jobs); confirm
   green.
5. Verify the dashboard shows **0 open alerts**, then close this ticket.

## Notes

- One backend advisory is **intentionally accepted**: `CVE-2026-28277`
  (langgraph msgpack deserialization, transitive via `google-adk`) is ignored in
  `pip-audit` — post-exploitation only, requires checkpoint-store write access,
  and LangGraph checkpointing is unused (ADK uses `InMemorySessionService`).
  Re-evaluate when an upstream fix ships.
