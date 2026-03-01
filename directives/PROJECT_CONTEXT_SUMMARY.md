- **Last Updated**: 2026-03-01T20:15:00Z
- **Current Version**: `v3.8.0` (ADK Migration Phase 1-3 & UI Premium Polish)
- **Last Major Sync**: 2026-03-01
- **Status**: `Production-Ready - Canary Proxy Active (10% Traffic to ADK)`
- **Next High Priority**: 1) Phase 4: Decommissioning LangGraph | 2) Biometric Auth Expansion | 3) Dynamic Robot Mascot

- **Phase 46 (Mar 01, 2026):** **Vertex AI ADK Integration - Phase 1, 2 & 3 (v3.8.0)**:
    - **ADKOrchestrator Full Implementation**: Multi-agent system (Triage, Design, Quote) with tool parity and multi-agent routing.
    - **HITL & Resumption**: Cryptographic resumption token pattern for Admin approval flows with interrupt() support.
    - **Canary Rollout Proxy**: `CanaryOrchestratorProxy` implemented for session draining and percentage-based routing (ADK_CANARY_PERCENT=10).
    - **UI Polishing**: Redesigned "Create Project" dialog (centered, minimalist), fixed chat header z-index/opacity, centered and polished Image Lightbox (75vh, object-contain, forced centering).
    - **Debugged SSE**: Fixed `/chat/stream` timeout by removing telemetry decorators from async generators.
    - **Security**: Verified auth coverage for quote routes and explicitly set GDPR regions (europe-west1).

- **Phase 47 (Future):** **Vertex AI ADK Integration - Phase 4: Decommissioning (v3.8.1+)**:
    - **Dependency Cleanup**: Remove LangGraph, LangChain, and redundant checkpointer code.
    - **Orchestration Simplification**: Direct instantiation of ADKOrchestrator in get_orchestrator().
    - **Biometric Auth Expansion**: WebAuthn passkey support for additional device categories.

---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v3.8.0
**Last Updated:** 2026-03-01T20:15:00Z
**Project Phase:** Phase 46 - Vertex AI ADK Integration (Phase 3: Canary Rollout & UI Polish)

---

## 🚀 ACTIVE PRIORITIES (Phase 46)

1.  **Phase 4: Decommissioning LangGraph**: Finalize the removal of legacy orchestrator code, LangGraph, and LangChain dependencies after successful verification of the Canary Rollout.
2.  **Dynamic Robot Mascot**: Context-aware mascot animations based on conversation phase (TRIAGE, DESIGN, QUOTE) and project type.
3.  **Biometric Auth Expansion**: WebAuthn passkey support for additional device categories + push notifications on approval flows.

## 📚 DOCUMENTATION HUB (Master Documents)
*For deep-dives into specific architectural domains, consult:*
- `docs/MASTER_AI_LOGIC.md`
- `docs/MASTER_FRONTEND_MOBILE.md`
- `docs/MASTER_SECURITY_QUALITY.md`
- `docs/MASTER_PRODUCT_JOURNEY.md`

_Documento aggiornato: Marzo 01, 2026_
