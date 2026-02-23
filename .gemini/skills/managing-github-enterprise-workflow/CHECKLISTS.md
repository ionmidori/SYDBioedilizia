# Professional Git Checklists

Standardized procedures for code reviews and emergency fixes.

## PR Review Checklist (Senior/Architect Level)

### 1. Architectural Integrity
- [ ] Does it maintain the 3-Tier separation (Directives/Orchestration/Execution)?
- [ ] Are business rules isolated in the backend (`backend_python`)?

### 2. Technical Quality
- [ ] **Type Safety**: No `any` types. Proper Pydantic/Zod schemas?
- [ ] **Concurrency**: Blocking CPU tasks wrapped in `run_in_threadpool`?
- [ ] **Data Contract**: Does Frontend TS match Backend Pydantic (Golden Sync)?

### 3. Security & Safety
- [ ] **Secrets**: No `.env` leaks or hardcoded keys?
- [ ] **Auth**: `verify_token` present on all protected routes?
- [ ] **Tests**: Unit tests for services, verification scripts for agents?

---

## Hotfix Protocol (Production Critical)

### 1. Execution
1. Branch from `main` (not `develop` or feature).
2. Minimal code changes (no refactoring).
3. Tag: `hotfix(scope): desc [URGENT]`.

### 2. Post-Mortem
1. Deploy and monitor for 30 minutes.
2. Backport/Merge hotfix into all active feature branches immediately.
3. Update `PROJECT_CONTEXT_SUMMARY.md` with the "Resolved Bug".
