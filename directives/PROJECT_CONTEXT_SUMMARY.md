# PROJECT CONTEXT SUMMARY (v4.0.18)
**Ultimo aggiornamento:** 10 Marzo 2026 (Phase 65)
**Status:** Production-Ready — Quote Flow Fix & WBS Engine (400/400 Backend Tests Passing with 25 new Unit Tests)

## 🎯 Obiettivi Correnti (Phase 65)
1.  **WBS Assembly Engine (Opzione A)**: Implementata espansione automatica dei preventivi tramite 12 macro-lavori. L'AI ora inferisce le fasi WBS (Demolizioni, Impianti, ecc.) da prompt vaghi.
2.  **Guided Question Engine (Opzione C)**: Introdotto il `completeness_score`. Il chatbot blocca preventivi incompleti (< 0.70) e pone domande tecniche mirate in italiano.
3.  **Price Book Cleanup**: Rimossi SKU Arredamento/Progettazione per focus esclusivo su SYD Bioedilizia (Ristrutturazioni).
4.  **Gemini CLI Workflow**: Stabilito pattern di "CLI Delegation" per task pesanti su singoli file tramite `/gemini-cli-delegation` workflow.

---

- **Phase 65 (Mar 10, 2026):** **Quote Flow Optimization (v4.0.18)**:
    - **WBS Engine (insight_engine.py)**: Aggiunta libreria `renovation_assemblies.json`. L'Engine usa un Chain-of-Thought in 4 fasi per espandere i lavori e taggare gli SKU con la fase WBS corretta.
    - **Completeness Gate (quote_tools.py)**: Se l'analisi dell'Engine ha uno score < 0.70, lo strumento restituisce `missing_info` (domande tecniche in italiano) invece di generare un preventivo inaccurato.
    - **Adaptive Questions (modes.py)**: Espansa la sezione `<adaptive_questions>` con checklist tecniche per 8 tipologie di stanze (Bagno, Cucina, ecc.).
    - **Golden Sync (quote.ts)**: Sincronizzate le interfacce TypeScript e Zod con i nuovi campi `phase`, `completeness_score` e `missing_info`.
    - **Price Book v2.1.0**: Rimossa categoria Arredamento (5 SKU). SYD Bioedilizia non si occupa di mobili.
    - **Test Coverage**: 25 test unitari (`test_insight_engine.py` e `test_pricing_engine.py`) tutti passanti.

- **Phase 64 (Mar 10, 2026):** **Render Display Fix, Dependency Security & Config Audit (v4.0.17)**:
    - **SSE call_id Mismatch Fix (adk_orchestrator.py)**: Risolto mismatch `call_id` tra tool-call e tool-result. Introdotto `pending_tool_calls` mapping.
    - **Protobuf Safety Cast (adk_orchestrator.py)**: Cast `MapComposite → dict` per serializzazione JSON.
    - **Jest 29→30 Upgrade (web_client)**: Risolve vulnerabilità `@tootallnate/once`.
    - **GEMINI.md Audit**: Corrette discrepanze tra regole e implementazione (Zustand/LangGraph/Quota).

- **Phase 63 (Mar 10, 2026):** **Backend Performance Hardening & ADK Session Persistence (v4.0.16)**:
    - **Event Loop Fix (upload.py)**: Wrapped sync Firebase SDK calls (`upload_from_string`, `patch`, `generate_signed_url`, `make_public`) in `run_in_threadpool()` to prevent event loop blocking during image uploads.
    - **Memory Safety (upload.py)**: Implemented `_safe_read_file()` with 1MB chunked reading + in-flight size enforcement, preventing OOM from spoofed Content-Length headers.
    - **DRY Quota Helper (upload.py)**: Extracted `_enforce_quota()` to eliminate 6-line duplication across `/image` and `/video` endpoints.
    - **ADK Session Restart (adk_orchestrator.py)**: On session creation, injected last 30 Firestore messages as ADK `Event` objects via `append_event()`, restoring conversation context after server restart.
    - **Storage Upload Threadpool (generate_render.py)**: Wrapped `upload_base64_image()` (sync Firebase SDK) in `asyncio.to_thread()` to prevent event loop blocking during render uploads.
    - **Test Compliance**: Updated mock names in `test_tools.py` to reflect renamed imports; all 375 backend tests passing.

- **Phase 62 (Mar 09, 2026):** **UI Polish & Animation Fidelity (v4.0.15)**:
    - **Chat Provider**: Sostituito testo statico con layout a liste numerate e simboli per una UX premium. Ancorato staticamente alla history per persistenza.
    - **Framer Motion**: Separazione easing in framer motion. Rotazione lineare continua + morphing `easeInOut` per il SydLoader, allineamento allo standard Android 16 Google M3 Expressive.
    - **ChatWidget Responsive Overlay**: Aggiunte regole responsive per l'overlay (sostituito backdrop-blur generico con varianti mobile-only via `md:bg-transparent md:backdrop-blur-none`).
    - **ChatWidget Drag-to-Close**: Implementata chiusura fluida tramite swipe down dall'header (`useDragControls` di framer-motion), rispettando lo scorrimento indipendente dei messaggi e lo standard M3 Expressive.

- **Phase 61 (Mar 07, 2026):** **Definitive Inversion Fix — Explicit Python Timestamps (v4.0.14)**:
    - **Backend Anchor (main.py)**: Backdated User message by 100ms using `datetime.now(timezone.utc)` to ensure it exists "before" the assistant response starts generating.
    - **Assistant Save (adk_orchestrator.py)**: Switched from `None` (SERVER_TIMESTAMP) to explicit `datetime.now(timezone.utc)`.
    - **Frontend Tie-breaker (useChatHistory.ts)**: Refined sorting to include `Math.abs < 0.1ms` handling and a strict `user < assistant` priority record.

- **Phase 60 (Mar 07, 2026):** **Stable Snapshot Timing (v4.0.13)**:
    - Introduced `snapshotTime` to ensure all messages in a single update use an identical fallback timestamp.

---

- **Current Version**: `v4.0.17`
- **Next High Priority**: 1) ADK Session cleanup cron for GDPR retention | 2) Dynamic Robot Mascot | 3) M3 Chat feedback integration | 4) Remaining 8 low-severity transitive vulns (firebase-admin→google-cloud chain, awaiting upstream fix)
