---
name: managing-github-enterprise-workflow
description: Enforces professional Git workflows for the SYD repository including atomic commits, conventional commits, feature branching, and PR standards. Use when preparing PRs, managing branches, or reviewing commit history.
---

# GitHub Enterprise Workflow — SYD

## Atomic Commits

Each commit = ONE logical change. No "and" in summaries.

```
feat(batch): add cross-project savings preview endpoint
fix(chat): prevent stale history sync after logout
chore(deps): upgrade reportlab to 4.1
```

## Conventional Commits

Format: `<type>(<scope>): <description>`

| Type | Use |
|------|-----|
| `feat` | New user feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Structural change (no logic/behavior change) |
| `chore` | Deps, config, CI |
| `hotfix` | Urgent production fix (branch from main) |

## Branching Strategy

- **main**: Production-ready. No direct commits.
- **Feature branches**: `feat/`, `fix/`, `hotfix/`, `refactor/` prefixes
- **Merge**: Squash and Merge to keep `main` linear

## PR Standards

```
## Summary
<1-3 bullet points>

## Test plan
- [ ] Backend: pytest passes
- [ ] Frontend: tsc --noEmit 0 errors
- [ ] Manual verification of affected feature
```

## Quick Reference

```bash
# Rebase before push
git pull --rebase origin main
git push origin branch-name

# Hotfix
git checkout main && git pull
git checkout -b hotfix/description
```

## Rules

1. **Never force-push main** — all pushes via PR
2. **Pre-commit hooks**: Husky runs ESLint + Prettier on `*.{ts,tsx,json,md,css}`
3. **CODEOWNERS**: Critical modules require specific reviewer approval
4. **Co-author**: AI-assisted commits include `Co-Authored-By` trailer
