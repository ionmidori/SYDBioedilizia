# PROJECT CONTEXT SUMMARY (v4.0.23)
**Ultimo aggiornamento:** 14 Marzo 2026 (Phase 70)
**Status:** Production-Ready — Self-Correction Loop & ADK Evaluation Infrastructure

## 🎯 Obiettivi Correnti (Phase 70)
1. **ADK Self-Correction Loop**: Implementato sistema completo di valutazione e auto-correzione basato su ADK `AgentEvaluator` + rubric custom SYD.
2. **Feedback Collection**: Raccolta rating utente (👍/👎) su messaggi assistant → Firestore → loop di miglioramento prompts.
3. **Triage Intent-First**: Orchestratore chiede intent prima di analizzare file caricati senza contesto; triage non ripropone domanda di routing se già in flusso preventivo/rendering.
4. **Eval Infrastructure**: 5 scenari SYD pronti per `AgentEvaluator` live; 13 pytest offline passano al 100%.

---

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

- **Current Version**: `v4.0.23`
- **Next High Priority**: 1) ADK Session cleanup cron for GDPR | 2) Admin dashboard page per negativi feedback (self-correction loop Fase 2) | 3) Replace remaining `Loader2` imports with `SydLoader` | 4) Automate Golden Sync generation | 5) Eseguire live eval run con `run_evals.py` (richiede GOOGLE_API_KEY + Vertex AI)
