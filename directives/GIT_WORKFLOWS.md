# GIT WORKFLOW SOP (Standard Operating Procedure)

This document defines the professional standards for version control within the `website-renovation` project.

## 1. Atomic Commits
- **Definition**: A commit should represent a single, logical change.
- **Rule**: If a commit requires the use of "and" in its description (e.g., "Fix login bug and update header styles"), it should be split into two separate commits.
- **Benefit**: Easier rollbacks, clearer history, and simplified code reviews.

## 2. Conventional Commits
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
`type(scope): description`

### Types:
- `feat`: A new feature for the user.
- `fix`: A bug fix for the user.
- `docs`: Documentation-only changes.
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `perf`: A code change that improves performance.
- `test`: Adding missing tests or correcting existing tests.
- `chore`: Changes to the build process or auxiliary tools and libraries.

### Example:
`feat(auth): add passkey authentication support`

## 3. Branching Strategy: Feature Branch Workflow
- **Main Branch**: `main` is always production-ready. Direct commits to `main` are strictly prohibited.
- **Feature Branches**: All work happens in branches named `feat/feature-name`, `fix/issue-name`, or `refactor/component-name`.
- **Merge Protocol**: Use Pull Requests (PRs). Before merging, the branch must pass:
  1. Linting and Static Analysis.
  2. All automated tests.
  3. Manual verification.

## 4. The "Push" Protocol
- **Pull Before Push**: Always run `git pull --rebase` before pushing to ensure your local branch is up-to-date with remote and to avoid unnecessary merge commits.
- **Frequency**: Push at least once a day to avoid large, conflict-prone merges.
- **Safety**: Never push incomplete or "broken" code to shared branches.

## 5. History Management (Squash & Merge)
- When merging a feature branch into `main`, use **Squash and Merge**.
- **Rationale**: Keeps the `main` history clean and linear, while retaining the granular history in the feature branch for development history.

## 6. Hotfix Protocol (Production Emergency)
When a critical bug is discovered in production, follow this expedited workflow:

### Steps:
1. **Create Hotfix Branch**: Branch directly from `main` using the naming convention `hotfix/issue-description`.
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/fix-payment-gateway-timeout
   ```

2. **Implement Fix**: Make the minimal change required to resolve the issue. Do not include unrelated improvements.

3. **Test Rigorously**: Run all automated tests plus manual verification of the specific bug scenario.

4. **Fast-Track PR**: Create a PR with the label `HOTFIX` and request immediate review.

5. **Deploy & Monitor**: After merge, deploy to production immediately and monitor error logs for 30 minutes.

6. **Backport to Feature Branches**: If active feature branches exist, merge the hotfix into them to prevent regression:
   ```bash
   git checkout feat/your-feature
   git merge main
   ```

### Commit Message Format:
`hotfix(scope): critical description [URGENT]`

Example: `hotfix(payments): fix Stripe timeout causing checkout failures [URGENT]`

## 7. Code Review Workflow
All code must be reviewed before merging to `main`. This ensures quality, knowledge sharing, and architectural consistency.

### PR (Pull Request) Checklist:
Before requesting review, ensure your PR includes:
- [ ] **Clear Title**: Following Conventional Commits format.
- [ ] **Description**: What problem does this solve? What approach did you take?
- [ ] **Testing Evidence**: Screenshots, test output, or manual verification steps.
- [ ] **Breaking Changes**: Explicitly call out any breaking changes with migration steps.
- [ ] **Self-Review**: Review your own diff first to catch obvious issues.

### Reviewer Responsibilities:
1. **Architecture Alignment**: Does this follow the 3-Tier separation (Directives/Orchestration/Execution)?
2. **Type Safety**: No `any` types, proper Pydantic/Zod validation?
3. **Error Handling**: Are errors handled gracefully with proper JSON responses?
4. **Performance**: Any blocking operations wrapped in `run_in_threadpool`?
5. **Security**: No leaked secrets, proper authentication checks?

### Review Turnaround Time:
- **Standard PRs**: Review within 24 hours.
- **Hotfixes**: Review within 2 hours (or immediately if critical).

### Approval Requirements:
- **Minor Changes** (docs, style, tests): 1 approval required.
- **Feature/Refactor**: 1 approval + all CI checks passing.
- **Hotfix**: 1 approval (can be expedited via async communication).
