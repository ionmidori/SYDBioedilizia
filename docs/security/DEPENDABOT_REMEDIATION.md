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

## Alert ledger

As of 2026-06-26 the dashboard shows **2 open** (both moderate, npm) and 154
closed — the earlier "1 high + extra moderates" were already remediated.

| # | Alert | Severity | Package | Manifest | Advisory | Resolution |
|---|-------|----------|---------|----------|----------|------------|
| 1 | #168 | Moderate | protobufjs | `package-lock.json` | GHSA-f38q-mgvj-vph7 (property shadowing) | ✅ **Fixed**: 7.6.2 → 7.6.4 (non-breaking `npm audit fix`) |
| 2 | #166 | Moderate | js-yaml | `package-lock.json` | GHSA-h67p-54hq-rp68 (quadratic-complexity DoS) | ⚠️ **Dismiss** (see below) — no clean fix |

### #166 js-yaml — recommended dismissal rationale

- **Not reachable by attackers.** The only production use is `gray-matter@4.0.3`
  (which pins `js-yaml ^3.13.1`, a 3.x line with no patched release) in
  `web_client/lib/blog.ts`, parsing **repo-authored** markdown frontmatter from
  `../docs/blog/*.md` at build/server time. The DoS requires attacker-supplied
  YAML with repeated-alias merge keys — never the case here.
- The remaining copies are the **dev-only** `jest` → `@istanbuljs` chain.
- **No non-breaking fix exists**: npm's only path is downgrading `gray-matter` to
  `2.0.1` (breaking). A blanket `js-yaml` override to 4.x/5.x would break
  `gray-matter` (the 3.x→4.x API removed `safeLoad`).
- **Action:** dismiss alert #166 on GitHub as *"Risk is tolerable"* with this
  rationale, and let Dependabot bump `gray-matter`/`js-yaml` when upstream ships
  a compatible release (tracked by the `npm-all` group in `dependabot.yml`).

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
| `web_client/` (`package.json`) | npm | ➖ workspace of `/` | ✅ via root lock audit (see below) |
| `/` (`package-lock.json`) | npm | ✅ (covers the workspace) | ✅ **new** `security-audit.yml` (prod, high) |
| `admin_tool/requirements.txt` | pip | ❌ | ✅ **new** `security-audit.yml` (`pip-audit`) |

> **Workspace note:** `web_client` is declared as an npm **workspace** in the
> root `package.json` (`"workspaces": ["web_client"]`). Its full dependency tree
> (next, firebase, sharp, @ai-sdk, zod, …) is already resolved inside the root
> `package-lock.json`. There is **no** separate `web_client/package-lock.json`
> and one must NOT be created — it would conflict with the workspace. The root
> lock is the single source of truth and is what `security-audit.yml` audits.
> npm audit across the whole tree reports **19 moderate, 0 high** — all moderates
> trace to the `js-yaml`/`gray-matter`/jest dev chain plus a `protobufjs` moderate
> (`GHSA-f38q-mgvj-vph7`, fixable non-breaking via `npm audit fix`). The single
> **high** alert is therefore NOT in the npm tree — look in the Python manifests.

## Controls added in this intervention

1. **`.github/dependabot.yml`** — scheduled, grouped weekly version-update PRs
   for every ecosystem: backend pip, admin_tool pip, npm at `/` (covers the
   `web_client` workspace), and github-actions. Grouping mirrors the team's
   "consolidated bumps".
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
3. The **high** alert is not in the npm tree (npm audit = 0 high). Look in the
   Python manifests: run `cd backend_python && uv run pip-audit --strict` and
   `cd admin_tool && pip-audit -r requirements.txt`. The backend job already
   gates this; `admin_tool` is newly gated by `security-audit.yml`.
4. The `protobufjs` moderate in the root lock is fixable non-breaking:
   `npm audit fix` (then commit the updated root `package-lock.json`).
5. Re-run the CI jobs; confirm green. Verify the dashboard shows **0 open
   alerts**, then close this ticket.

> ⚠️ Do **not** add a `web_client/package-lock.json` — `web_client` is an npm
> workspace and is already covered by the root lock (see Workspace note above).
> A separate lockfile would break the workspace resolution.

## Notes

- One backend advisory is **intentionally accepted**: `CVE-2026-28277`
  (langgraph msgpack deserialization, transitive via `google-adk`) is ignored in
  `pip-audit` — post-exploitation only, requires checkpoint-store write access,
  and LangGraph checkpointing is unused (ADK uses `InMemorySessionService`).
  Re-evaluate when an upstream fix ships.
