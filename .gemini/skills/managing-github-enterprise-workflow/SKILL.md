---
name: managing-github-enterprise-workflow
description: Professional Git workflows and GitHub Enterprise standards for codebase management. Includes atomic commits, conventional commits, feature branching, and enterprise security policies. Use when preparing PRs, managing branches, or establishing repo-level governance.
---

# GitHub Enterprise Git Workflow

Maintain a professional, traceable, and secure codebase using industry-standard Git practices and GitHub Enterprise policies.

## Core Protocols

### 1. Atomic Commits
- **Definition**: Each commit represents ONE logical change.
- **Rule**: No "and" in commit summaries. Split "Fix login and style" into two commits.
- **Goal**: Minimize regression risk and simplify rollbacks.

### 2. Conventional Commits
Format: `<type>(<scope>): <description>`

- `feat`: New user feature.
- `fix`: Bug fix.
- `docs`: Documentation updates.
- `refactor`: Structural change (no logic/bug fix).
- `chore`: Infrastructure/dependency maintenance.
- `hotfix`: Urgent production fix (see [CHECKLISTS.md](CHECKLISTS.md)).

### 3. Feature Branching
- **main**: Production-ready. No direct commits.
- **Branches**: Use `feat/`, `fix/`, `hotfix/`, or `refactor/` prefixes.
- **Merge**: Use **Squash and Merge** to keep `main` history linear.

## Advanced Governance

- **Access Control**: Role-Based Access Control (RBAC) and MFA enforcement.
- **Code Ownership**: Use `CODEOWNERS` for critical modules.
- **Security Protocols**: See [ENTERPRISE_POLICIES.md](ENTERPRISE_POLICIES.md) for OIDC, Secrets, and Disaster Recovery.
- **PR Checklists**: See [CHECKLISTS.md](CHECKLISTS.md) for the "Lead Full-Stack" review standards.

## Quick reference

**Rebase before push**:
```bash
git pull --rebase origin main
git push origin branch-name
```

**Hotfix creation**:
```bash
git checkout main && git pull
git checkout -b hotfix/description
```
