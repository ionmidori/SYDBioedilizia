# 🤝 Multi-Agent Collaboration Protocol (v1.0)

This protocol ensures that **Antigravity**, **Gemini-CLI**, and **Claude Code** work harmoniously without overwriting each other's work or losing architectural context.

## 1. The Startup Ritual (Mandatory)
Before performing any modification, every agent MUST follow this sequence:
1.  **Pull & Rebase**: Execute `git pull --rebase` to integrate remote changes.
2.  **Memory Refresh**: Read `directives/PROJECT_CONTEXT_SUMMARY.md` (Active Context) to identify the current Phase and latest version.
3.  **Status Audit**: Run `git status` to check for uncommitted "agent handoff" work.

## 2. Commit & Push Standards
*   **Atomic Logic**: Each commit must represent a single logical feature or fix.
*   **Conventional Messages**: Follow the project's commit standard (`feat:`, `fix:`, `docs:`, `chore:`).
*   **Sync Logic**: Use `git push --force-with-lease` ONLY after a successful rebase onto `origin/main`. Never use a destructive simple `--force`.

## 3. Shared Memory Guardrails
*   **Tier A (Active)**: Update `directives/PROJECT_CONTEXT_SUMMARY.md` at the end of every successful session.
*   **Tier B (Historical)**: Move completed phases to `directives/HISTORICAL_MILESTONES.md` only when they are fully production-stabilized.
*   **Validation**: Ensure "Golden Sync" is maintained between Backend Pydantic models and Frontend TypeScript interfaces.

## 4. Conflict Resolution Protocol
1.  **Detection**: If a push fails, immediately `git fetch origin` and `git rebase origin/main`.
2.  **Resolution**: In case of merge conflicts, the agent must carefully resolve them by prioritizing the most recent architectural decisions documented in the Directives.
3.  **Escalation**: If an agent is "confused" by a state mismatch, it must stop and request a `memory refresh` from the human user.

## 5. Directory Sovereignty
- **Frontend**: `web_client/`
- **Backend**: `backend_python/`
- **Memory/Rules**: `directives/`
- **Agent Workflows**: `.agent/`

---
_Ultimo aggiornamento: 24 Febbraio 2026_
