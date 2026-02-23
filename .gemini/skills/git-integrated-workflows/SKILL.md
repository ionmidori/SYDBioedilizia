---
description: Definitive Git & GitHub mastery skill. Merges Agentic protocols, Enterprise standards, and Advanced techniques. Covers Atomic Commits, PR Standards, Security Policies, and Disaster Recovery.
---

# Git & GitHub Integrated Workflows

This skill is the **Unified Source of Truth** for Version Control in Antigravity. It merges:
1.  **Agentic Protocols** (How AI Agents interact with Git).
2.  **Enterprise Standards** (Governance and Security).
3.  **Advanced Techniques** (Recovery and History Management).

## Part 1: Agentic Protocols (The "AI Rulebook")

### 1.1 The "Atomic Intent" Rule
**Rule**: An agent must never bundle unrelated changes into a single commit.
*   **Bad**: "Fix login bug and add new user profile style"
*   **Good**: Two separate commits:
    1.  `fix(auth): handle null token in login response`
    2.  `feat(ui): implement new user profile card design`

**Why**: Atomic commits enable granular reverts and clearer `git bisect` runs.

### 1.2 Strict Conventional Commits
Agents must follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/):

| Type | SemVer | Description |
| :--- | :--- | :--- |
| `feat` | MINOR | New feature for the user. |
| `fix` | PATCH | Bug fix. |
| `docs` | PATCH | Documentation only. |
| `style` | PATCH | Formatting (prettier, ruff). |
| `refactor` | PATCH | Code change with no behavior change. |
| `perf` | PATCH | Performance improvement. |
| `test` | PATCH | Adding/fixing tests. |
| `chore` | PATCH | Build/dep maintenance. |

**Example**:
```text
fix(middleware): implement exponential backoff for 429 errors

Caught the upstream RateLimitException and added a 3-retry loop.
Prevents worker crash during high load.
```

### 1.3 PR Description Template
When opening a PR, use this template to facilitate human review:

```markdown
## 🤖 AI Generated PR
**Type**: `feat` | `fix` | `refactor`
**Risk**: `Low` | `Medium` | `High`

### 💡 Summary
Brief execution summary.

### 🔍 Key Changes
- Modified `src/auth.py`: Added validation logic.
- Updated `tests/`: Added unit tests for edge cases.

### 🧪 Verification
1. `pytest` passed.
2. Verified login flow manually.
```

---

## Part 2: Enterprise Standards (Governance)

### 2.1 Branching Strategy (GitHub Flow)
*   **main**: Production-ready. Protected (Require PR, Status Checks).
*   **feat/name**: Feature branches. Short-lived.
*   **fix/issue-id**: Bug fix branches.
*   **Squash & Merge**: Enforce linear history on `main`.

### 2.2 Security Protocols
*   **No Secrets**: Pre-commit hooks must scan for API keys.
*   **Signed Commits**: Use GPG/SSH signing where configured.
*   **CODEOWNERS**: Respect ownership rules for critical paths (`src/auth/`).

---

## Part 3: Advanced Techniques (The Toolkit)

### 3.1 Interactive Rebase (Cleanup)
Clean up history *before* pushing code for review.

```bash
# Rebase last 5 commits
git rebase -i HEAD~5

# Commands:
# p, pick = use commit
# r, reword = use commit, but edit the commit message
# s, squash = use commit, but meld into previous commit
```

### 3.2 Git Worktrees (Multi-Tasking)
Work on a hotfix without stalling the current feature.

```bash
git worktree add ../hotfix-branch hotfix/critical-bug
cd ../hotfix-branch
# Fix bug, commit, push
cd ../main-repo
git worktree remove ../hotfix-branch
```

### 3.3 Reflog (Disaster Recovery)
Recover "lost" commits after a bad reset.

```bash
git reflog
# abc123 HEAD@{1}: commit: important work
git reset --hard abc123
```

### 3.4 Git Bisect (Bug Hunting)
Find the exact commit that broke the build.

```bash
git bisect start
git bisect bad              # Current version is bad
git bisect good v1.0.0      # Last known good version
git bisect run pytest       # Automate with test script
```

---

## Checklist for Every Commit
- [ ] Is the commit atomic? (One logical change)
- [ ] Does the message follow Conventional Commits?
- [ ] Did I run tests/linters before committing?
- [ ] am I on the correct branch?
