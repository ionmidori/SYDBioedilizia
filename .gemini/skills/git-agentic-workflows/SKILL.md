---
description: Specialized Git protocols for Autonomous AI Agents. Covers Atomic Commits, Conventional Commits v1.0, and PR Templates designed for high-trust human review.
---

# Git Agentic Workflows

This skill defines the **Strict Protocol** for how AI Agents should interact with version control. Unlike human workflows, agentic workflows prioritize *explicitness*, *traceability*, and *atomicity* to facilitate human review.

## 1. The "Atomic Intent" Rule

**Rule**: An agent must never bundle unrelated changes into a single commit.
*   **Bad**: "Fix login bug and add new user profile style"
*   **Good**: Two separate commits.
    1.  `fix(auth): handle null token in login response`
    2.  `feat(ui): implement new user profile card design`

**Why**: If the "login fix" is good but the "profile design" is bad, the human reviewer can revert one without losing the other.

## 2. Conventional Commits (Strict Enforcement)

Agents must follow the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) specification without deviation.

**Format**:
```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Allowed Types**:
*   `feat`: A new feature (correlates with MINOR in SemVer).
*   `fix`: A bug fix (correlates with PATCH in SemVer).
*   `docs`: Documentation only changes.
*   `style`: Formatting, missing semi-colons, etc; no production code change.
*   `refactor`: A code change that neither fixes a bug nor adds a feature.
*   `perf`: A code change that improves performance.
*   `test`: Adding missing tests or correcting existing tests.
*   `chore`: Changes to the build process or auxiliary tools (e.g., config changes).

**Example**:
```text
fix(middleware): handle rate limit exception gracefully

Caught the 429 error from the upstream API and implemented
exponential backoff. Previously it crashed the worker.

Fixes: #123
```

## 3. PR Description Template for Agents

When creating a Pull Request, use this template to maximize trust.

```markdown
## 🤖 AI Generated PR

**Type**: `feat` | `fix` | `refactor`
**Risk**: `Low` | `Medium` | `High`

### 💡 Summary
Briefly explain *what* was changed and *why*.

### 🔍 Key Changes
- Modified `src/auth.py` to add validation.
- Updated `tests/test_auth.py` to cover new case.

### 🧪 Verification Plan
I have verified this by:
1. Running `pytest tests/test_auth.py` (Pass).
2. Manually checking the login flow with invalid credentials.

### ⚠️ Breaking Changes
(List any breaking changes or "None")
```

## 4. Semantic Versioning Awareness

Before committing, check `package.json` or `pyproject.toml`.
*   If your change is a `feat`, ensure you are not breaking existing public APIs unless intended (MAJOR).
*   If you are refactoring, ensure no behavior change exists.

## 5. Branch Naming Strategy

*   `agent/<short-description>`: Default for general tasks.
*   `agent/fix/<issue-id>`: For specific bug fixes.
*   `agent/feat/<feature-name>`: For new features.

Avoid generic names like `agent/update-1`. Be descriptive: `agent/refactor-auth-middleware`.
