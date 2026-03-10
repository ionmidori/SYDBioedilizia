# PROJECT CONTEXT SUMMARY (v4.0.17)
**Ultimo aggiornamento:** 10 Marzo 2026 (Phase 64)
**Status:** Production-Ready — Render Display Fix & Dependency Security (375/375 Backend, 114/114 Frontend Tests Passing)

## 🎯 Obiettivi Correnti (Phase 64)
1.  **Render Display Fix**: Risolto mismatch `call_id` tra tool-call e tool-result nel protocollo SSE che impediva ai render generati di apparire nella chat.
2.  **Dependency Security**: Aggiornato Jest 29→30 per risolvere vulnerabilità `@tootallnate/once`; aggiornato firebase-admin a 13.7.0.
3.  **GEMINI.md Audit**: Corretti 8 errori/obsolescenze nel file di regole globali (VertexAi, structlog, Zustand, Redis, Shadcn, LangGraph rollback).

---

- **Phase 64 (Mar 10, 2026):** **Render Display Fix, Dependency Security & Config Audit (v4.0.17)**:
    - **SSE call_id Mismatch Fix (adk_orchestrator.py)**: ADK `function_response` non preserva `call_id` → il frontend AI SDK non correlava tool-result con tool-call. Introdotto `pending_tool_calls` mapping (name→id) + catena di fallback robusta (`fr.call_id` → `fr.id` → mapping → 'unknown').
    - **Protobuf Safety Cast (adk_orchestrator.py)**: Aggiunto cast `MapComposite → dict` per garantire serializzazione JSON del tool result.
    - **Jest 29→30 Upgrade (web_client)**: Risolve vulnerabilità `@tootallnate/once` (GHSA-vpq2-c234-7xj6). Aggiornati mock `crypto.randomUUID` (jest.spyOn), test ChatInput (input separati + Cloud icon), e `@types/jest`.
    - **GEMINI.md Audit**: Corretti 8 punti: VertexAiSessionService→InMemory+Firestore, structlog→logging, Zustand rimosso, Shadcn→Radix primitives, quota Firestore-based, LangGraph rollback rimosso, sezione duplicata eliminata, chat model documentato.
    - **Path-scoped Claude Rules**: Creati `.claude/rules/backend.md` e `.claude/rules/frontend.md` per regole contestuali.

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
