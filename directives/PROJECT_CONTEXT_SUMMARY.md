# PROJECT CONTEXT SUMMARY (v4.0.24)
**Ultimo aggiornamento:** 14 Marzo 2026 (Phase 71)
**Status:** Production-Ready — ADK Session Persistence Hardening

## 🎯 Obiettivi Correnti (Phase 71)
1. **ADK Session Recovery Hardening**: Fallback mid-stream per `SessionNotFoundError` in `adk_orchestrator.py` — se la sessione sparisce durante `run_async` (race condition post-restart), il sistema ricrea la sessione, re-inietta la history da Firestore e riprova automaticamente una volta.
2. **Quote Flow Continuity**: Garantita continuità del flusso preventivo anche dopo restart del backend durante una sessione attiva.

---

- **Phase 71 (Mar 14, 2026):** **ADK Session Persistence Hardening & Dead-code cleanup (v4.0.24)**:
    - **Dead-code elimination**: Rimozione di file e variabili inutilizzate nel backend con Ruff e Vulture.
    - **Ripristino file di Feedback**: Ripristinati `src/api/feedback.py`, `src/repositories/feedback_repository.py`, e `src/schemas/feedback.py` precedentemente rimossi per errore dal tool di dead-code elimination (aggiunti recentemente da un altro agente in Phase 70).
    - **Mid-stream recovery (`adk_orchestrator.py`)**: Aggiunto `_run_with_session_recovery()` async generator — avvolge `runner.run_async()` con retry una volta sola su `SessionNotFoundError`. Al secondo tentativo: ricrea sessione ADK, re-inietta ultimi 30 messaggi Firestore come Events, richiama `run_async`. Copre race condition non coperta dal pre-flight check già esistente.
    - **Structured logging**: Log `restored=True/False` su ogni invocazione `run_async` per diagnostica restart recovery.

- **Phase 70 (Mar 14, 2026):** **Self-Correction Loop, ADK Evals & Triage Fix (v4.0.23)**:
    - **ADK Evaluation Suite (tests/evals/)**: Infrastruttura completa: `test_config.json`, `syd_rubrics.py` (6 rubric: `no_furniture`, `italian_only`, `has_mq`, `sku_present`, `no_routing_in_quote_flow`, `intent_first_on_upload`), 3 file `.test.json` (quote/design/triage), runner standalone (`run_evals.py`), 13 pytest offline.
    - **root_agent alias (agents.py)**: Aggiunto `root_agent = syd_orchestrator` per compatibilità `AgentEvaluator`.
    - **Feedback API (src/api/feedback.py)**: `POST /feedback` → `sessions/{sid}/feedback/{fid}` Firestore. Pydantic models con Golden Sync TypeScript.
    - **Feedback UI (MessageFeedback.tsx)**: Componente 👍/👎 integrato in `MessageItem` su tutti i messaggi assistant. Animazione M3 Expressive. Visibile on hover.
    - **Skill evaluating-adk-agents**: Skill Claude Code custom con `SKILL.md` + `EVAL_SET.md` + `SELF_CORRECTION.md` — pattern per chiudere il loop failure → diagnosi → patch prompt.
    - **Triage Intent-First (agents.py)**: Orchestratore chiede "Rendering / Preventivo / Solo analisi?" PRIMA di delegare quando file caricato senza intent. Triage adatta conclusione al contesto (quote flow → no routing question).

- **Phase 69 (Mar 13, 2026):** **ADK Image Generation & Firestore Async Fix (v4.0.22)**:
    - **ADK Hardening (adk_orchestrator.py)**: Aggiunta guard per `actual_message` non vuoto prima di `run_async`, prevenendo `ValueError` su comandi senza testo.
    - **Firestore Fix (conversation_repository.py)**: Standardizzato l'uso del client asincrono in `ensure_session` per prevenire `TypeError` (await su snapshot sincroni).
    - **Performance (adk_orchestrator.py)**: Esteso timeout `asyncio` a 180s per permettere il rendering completo Gemini + Imagen 3.
    - **Tool Audit (tools.py & generate_render.py)**: Verificata configurazione `gemini-3.1-flash-image-preview` e mapping parametri tool.

- **Phase 68 (Mar 13, 2026):** **Video Trimmer, Asset Carousel & SEO Social Fix (v4.0.21)**:
    - **Video Trimmer (VideoTrimmer.tsx)**: Modal interattivo con anteprima video e range slider per selezione punti Start/End. Integrato bloccando l'upload in `ChatInput.tsx`.
    - **Media Carousel (MediaCarousel.tsx)**: Implementazione sezione "Media Recenti" (Bento/Glassmorphism) con fetching real-time via `useGalleryAssets`.
    - **Social Media Fix (layout.tsx)**: Aggiornata `og:image` con foto di portfolio ("Capolavori"). Rimossi robotino/mascot dai metadati di condivisione link.
    - **UI Polish**: Standardizzato font messaggi chat via `prose-sm` (14px). Fixato z-index e propagation sui tasti Rinomina/Elimina della dashboard.
    - **Cleanup**: Rimozione `GlobalFileUploader.tsx`, `types/lead.ts`, `types/quote.ts`, `components/DebugLayout.tsx` e file OG obsoleti.

- **Phase 67 (Mar 13, 2026):** **Frontend Dead Code Cleanup & Build Hardening (v4.0.20)**:
    - **Dead Code Elimination**: Eliminati file orfani individuati da `knip` e analisi manuale.
    - **Dead Export Cleanup**: Rimosse utility interne esportate ma mai consumate.
    - **Firebase Admin SDK Sync**: Ripristinato export `getFirebaseAuth` e `getFirestoreDb` in `firebase-admin.ts`.
    - **Build Check**: Completata build di produzione (Turbopack) pulita al 100%.

- **Phase 66 (Mar 12, 2026):** **Dashboard UX & Recent Media (v4.0.19)**:
    - **Project Controls Fix (ProjectCard.tsx)**: Spostati pulsanti Rinomina/Elimina per evitare sovrapposizioni.
    - **Bento Grid Extension (globals.css)**: Espanso il layout della griglia bento per la nuova area media.
    - **Dependencies**: Installata `date-fns` per localizzazione date.

- **Phase 65 (Mar 10, 2026):** **Quote Flow Optimization (v4.0.18)**:
    - **WBS Engine (insight_engine.py)**: Aggiunta libreria `renovation_assemblies.json`. Tagging SKU con fase WBS.
    - **Completeness Gate**: Score < 0.70 innesca domande tecniche via `missing_info`.
    - **Price Book v2.1.0**: Rimossa categoria Arredamento.

- **Phase 64 (Mar 10, 2026):** **Render Display Fix, Dependency Security & Config Audit (v4.0.17)**:
    - **SSE call_id Mismatch Fix**: Risolto mapping `call_id` per tool streaming.
    - **Jest 29→30 Upgrade**: Risolta vulnerabilità `@tootallnate/once`.

---

- **Current Version**: `v4.0.24`
- **Next High Priority**: 1) ADK Session cleanup cron for GDPR | 2) Admin dashboard page per negativi feedback (self-correction loop Fase 2) | 3) Replace remaining `Loader2` imports with `SydLoader` | 4) Automate Golden Sync generation | 5) Eseguire live eval run con `run_evals.py` (richiede GOOGLE_API_KEY + Vertex AI)
