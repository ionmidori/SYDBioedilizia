# PROJECT CONTEXT SUMMARY (v4.0.27)
**Ultimo aggiornamento:** 17 Marzo 2026 (Phase 73)
**Status:** Production-Ready — Security Guardrails & Batch Processing Hardening

## 🎯 Obiettivi Correnti (Phase 73)
1. **Model Armor Guardrails**: Input/Output sanitization via Gemini Model Armor.
2. **Batch Processing Engine**: Aggregation logic for bulk operations.
3. **Security Audit remaining**: CSRF webhook, OpenTelemetry sampling, error budget.

---

- **Phase 73 (Mar 17, 2026):** **Model Armor Security Guardrails & Batch Processing (v4.0.27)**:
    - **Model Armor Integration**: Implementati i checkpoint di sicurezza in ADK via Google Cloud Model Armor. Configurato `before_model_callback` per la difesa da Prompt Injection (LLM01) e `after_model_callback` per la prevenzione di Data Leak (LLM02). Sistema fail-open garantito.
    - **TDD Verification**: Creati 10 test unitari (5 input, 5 output) con mocking di `google-adk` per garantire la stabilità in ambienti CI. 100% pass rate.
    - **Batch Processing Engine**: Implementata la logica di aggregazione in `batch_aggregation_engine.py` e nuovi endpoint in `batch_routes.py` per gestire operazioni di massa sul frontend (Bento Grid interactions).
    - **Frontend CSP Hardening**: Risolto errore Chrome su iframe Firebase Auth aggiungendo la direttiva granulare `frame-src 'self' https://chatbotluca-a8a73.firebaseapp.com` in `proxy.ts`, mantenendo inalterata la sicurezza generale contro clickjacking.
    - **Quote Schema Hardening**: Aggiornato `QuoteItem` e `quote.py` per supportare metadati estesi sincronizzati con n8n.
    - **Status**: Backend tests passing, security guardrails ready for deployment.

- **Phase 72 (Mar 17, 2026):** **Feedback Persistence Fix, Enterprise Roadmap & Testimonials (v4.0.26)**:
    - **Testimonials Feature**: Implementata la funzionalità per lasciare recensioni nella sezione "Dicono di noi" della Home per gli utenti registrati. Aggiunto modulo interattivo con validazione Zod e React Hook Form, salvataggio in Firestore con stato `pending` e permessi di sicurezza in `firestore.rules` aggiornati.
    - **Feedback Persistence Fix**: Il componente `MessageFeedback` (thumbs up/down) ora mantiene il suo stato anche dopo il ricaricamento della pagina. Il backend (`FeedbackRepository`) ora salva il campo `rating` direttamente nel documento originale del messaggio su Firestore, oltre che nella sua subcollection dedicata. Il frontend (`useChatHistory`) legge questo campo e ripristina lo stato corretto tramite `initialRating`.
    - **Week 1 (d235e36)**: Security hardening — auth, tier isolation, attachment fix, HMAC verification
    - **Week 2 (7679c9b)**: Resilience — circuit breaker, idempotency, atomic quota reset, race condition prevention
    - **Week 3 (143cca0)**: Observability — OpenTelemetry tracing, tool instrumentation, CSP nonce generation, request ID injection
    - **Week 4 (baeb5d1)**: Data Governance — immutable audit trail service + Firestore TTL policies for GDPR retention
    - **Code Review Integration (30a800b)**: Addressed 12+ findings from Weeks 1-2 (memory exhaustion, event loop blocking, DRY violations, unused imports, socket timeout, cache overflow)
    - **Gallery Fix (b9a6e5b)**: Uploaded photos now persisted to Firestore. Upload endpoint calls `repo.save_file_metadata()` after Cloud Storage upload so photos appear in gallery alongside renders.
    - **Build Fix (94a2bef)**: Migrated `middleware.ts` → `proxy.ts` for Next.js 16 compatibility. Vercel build now succeeds.
    - **Status**: Backend tests passing, Vercel building successfully.

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

- **Current Version**: `v4.0.27`
- **Production Audit Status**: 46/51 items complete (+security guardrails). Open items: CSRF webhook N8N (HMAC-SHA256), OpenTelemetry sampling config (Cloud Console), Error budget alerting (Cloud Monitoring), Log-based metrics (Cloud Logging), Signal handling in Cloud Run service config
- **Next High Priority**: 1) Enable Model Armor in GCP Console | 2) Admin dashboard for self-correction loop (Phase 2) | 3) Automate Golden Sync generation | 4) Live eval run with `run_evals.py` | 5) Batch processing UI optimization

