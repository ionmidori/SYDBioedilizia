# PROJECT CONTEXT SUMMARY (v4.0.14)
**Ultimo aggiornamento:** 7 Marzo 2026 (Phase 61)
**Status:** Production-Ready — Inversion fixed with explicit Python timestamps (0 TS Errors)

## 🎯 Obiettivi Correnti (Phase 61)
1.  **Risoluzione Definitiva Inversione Messaggi**: Passaggio dai timestamp lato server (Firestore) a timestamp espliciti Python (`datetime.now`) per garantire l'ordine fisico tra User e Assistant.
2.  **Hardening Frontend**: Rafforzamento del tie-breaker in `useChatHistory.ts` per gestire millisecondi identici.

---

- **Phase 61 (Mar 07, 2026):** **Definitive Inversion Fix — Explicit Python Timestamps (v4.0.14)**:
    - **Backend Anchor (main.py)**: Backdated User message by 100ms using `datetime.now(timezone.utc)` to ensure it exists "before" the assistant response starts generating.
    - **Assistant Save (adk_orchestrator.py)**: Switched from `None` (SERVER_TIMESTAMP) to explicit `datetime.now(timezone.utc)`.
    - **Frontend Tie-breaker (useChatHistory.ts)**: Refined sorting to include `Math.abs < 0.1ms` handling and a strict `user < assistant` priority record.

- **Phase 60 (Mar 07, 2026):** **Stable Snapshot Timing (v4.0.13)**:
    - Introduced `snapshotTime` to ensure all messages in a single update use an identical fallback timestamp.

---

- **Current Version**: `v4.0.14`
- **Next High Priority**: 1) Dynamic Robot Mascot | 2) Unify Dashboard Loaders (SydLoader) | 3) ADK Session cleanup cron
