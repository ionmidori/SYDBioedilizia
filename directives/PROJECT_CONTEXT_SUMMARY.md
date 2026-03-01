- **Last Updated**: 2026-03-01T15:30:00Z
- **Current Version**: `v3.7.0` (ADK Migration Phase 0 - Abstraction Layer Complete)
- **Last Major Sync**: 2026-03-01
- **Status**: `Production-Ready - Dual-Mode Architecture Ready`
- **Next High Priority**: 1) Phase 1: ADK Prototype in Staging | 2) Biometric Auth Expansion | 3) Dynamic Robot Mascot

- **Phase 45 (Mar 01, 2026):** **Vertex AI ADK Integration - Phase 0: Abstraction Layer (v3.7.0)**:
    - **BaseOrchestrator ABC**: Created abstract interface (`src/services/base_orchestrator.py`) defining contract for all orchestration backends with `stream_chat()`, `resume_interrupt()`, and `health_check()` abstract methods.
    - **LangGraphOrchestrator Alias**: Established canonical naming via `LangGraphOrchestrator = AgentOrchestrator` to explicitly identify current production implementation and prepare naming conventions for future ADKOrchestrator.
    - **OrchestratorFactory**: Implemented `get_orchestrator()` FastAPI dependency factory (`src/services/orchestrator_factory.py`) for runtime selection via `ORCHESTRATOR_MODE` environment variable with graceful fallback to LangGraph.
    - **Configuration**: Added `ORCHESTRATOR_MODE` field to settings (defaults to "langgraph") plus ADK-specific fields: `ADK_LOCATION`, `ADK_CANARY_PERCENT`, `ADK_CMEK_KEY_NAME` for future phases.
    - **Zero-Downtime Integration**: Updated type hints in `main.py` from concrete `AgentOrchestrator` to abstract `BaseOrchestrator` without breaking existing API or behavior.
    - **Test Coverage**: Created comprehensive unit test suite (`test_orchestrator_interface.py`) with 10 tests verifying ABC contract compliance, factory fallback logic, and health_check behavior. All tests passing (10/10).
    - **Gate Status**: ✅ Phase 0 complete — zero regression on existing test suite, all new ABC contract tests passing, production-safe.

- **Phase 46 (Future):** **Vertex AI ADK Integration - Phases 1 & 2 (v3.7.1+)**:
    - **ADKOrchestrator Implementation**: Multi-agent system with tool parity (Render, Gallery, Pricing, CAD).
    - **HITL & Resumption**: Resumption token pattern with cryptographic nonces for secure admin approval flow.
    - **Canary Proxy**: Deterministic traffic splitting with session draining for in-flight HITL conversations.
    - **Security Hardening**: GDPR Data Residency (EU-only), CMEK encryption, prompt injection bounds checking.

---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v3.7.0
**Last Updated:** 2026-03-01T15:30:00Z
**Project Phase:** Phase 45 - Vertex AI ADK Integration (Phase 0: Abstraction Layer Complete)

---

## 🚀 ACTIVE PRIORITIES (Phase 45)

1.  **Phase 1: ADK Orchestrator Implementation**: Multi-agent system in `src/adk/` with tool registration for Render, Gallery, Pricing, CAD. Target: staging environment with GDPR constraints (EU-only, CMEK encryption).
2.  **Dynamic Robot Mascot**: Context-aware mascot animations based on conversation phase (TRIAGE, DESIGN, QUOTE) and project type.
3.  **Biometric Auth Expansion**: WebAuthn passkey support for additional device categories + push notifications on approval flows.

## 📚 DOCUMENTATION HUB (Master Documents)
*For deep-dives into specific architectural domains, consult:*
- `docs/MASTER_AI_LOGIC.md`
- `docs/MASTER_FRONTEND_MOBILE.md`
- `docs/MASTER_SECURITY_QUALITY.md`
- `docs/MASTER_PRODUCT_JOURNEY.md`

_Documento aggiornato: Marzo 01, 2026_
