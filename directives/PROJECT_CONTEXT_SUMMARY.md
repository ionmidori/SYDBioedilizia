# PROJECT CONTEXT SUMMARY (v4.4.5)
**Ultimo aggiornamento:** 06 Giugno 2026 (Phase 85c)
**Status:** Production-Ready — Dependency Security Hardened (0 Dependabot alerts) + ADK 2.x Migration + Webhook Vendor-Neutral Headers

## 🎯 Obiettivi Correnti (Phase 85c)
1. **RAG Eval da Eseguire**: `eval_rag.py` + `rag_test_set.json` pronti. Richiede `uv add ragas langchain-google-vertexai datasets`, poi `uv run python scripts/eval_rag.py`. Namespace `prezzario` contiene 2.859 vettori.
2. **n8n Live**: 4 workflow attivi. Gmail SMTP configurato. Header HMAC ora `X-SYD-Timestamp` / `X-SYD-Signature` (rinominati da `X-N8N-*`). `SYD_WEBHOOK_SECRET` non ancora settato su Cloud Run (HMAC bypass attivo — dev mode warning).
3. **Admin Console**: https://syd-admin-972229558318.europe-west1.run.app
4. **Cookie Consent Banner (EU GDPR)**: Non ancora implementato.
5. **Knowledge Distillation**: Namespace `normative` (5 chunks, legacy test data) — mantiene sample data per validazione.
6. **Secret-Scanning Alert Aperto**: 1 Firebase Web API key esposta in `docs/RECAPTCHA_VERIFICATION_REPORT.md` (commit `061234a`, ora untracked). Non-critical (chiave client-side protetta da App Check + Security Rules) ma da chiudere su GitHub.

---

- **Phase 85c (Giu 06, 2026):** **Security Dependency Hardening + Cloud Build Fix + Webhook Vendor-Neutral Headers (v4.4.5)**:
    - **Dependabot Cleanup**: Risolti 80 alert (2 critical, 25 high, 42 moderate, 11 low). Python `uv.lock`: `google-adk 1.27.2 → 2.2.0` (CVE-2026-4810, code injection + missing auth), `starlette → 1.2.1` (CVE-2026-48710), `pillow → 12.2.0`, `pypdf → 6.13.0`, `python-multipart → 0.0.32`, `fastapi → 0.136.3`, `cryptography → 48.0.0`, `urllib3 → 2.7.0`, `pytest → 9.0.3`. Rimossa la dep legacy `google-generativeai` (non importata, sostituita da `google-genai`). npm `package-lock.json`: `next → 16.2.6`, `postcss → 8.5.10`, più overrides forzati per `protobufjs ^7.5.8` (CVE-2026-41242 CRITICAL), `node-forge ^1.4.0`, `lodash ^4.18.0`, `fast-xml-parser ^5.7.0`, `uuid ^11.1.1`. Post-fix: `npm audit` = 0 vulnerabilità.
    - **ADK 2.x Migration**: La major version bump da `google-adk 1.x` è stata necessaria per ottenere `starlette ≥ 1.0.1` (la 1.x richiedeva `starlette < 1.0.0`). Imports verificati compatibili (`Runner`, `Agent`, `FunctionTool`, `Event`, `EventActions`, `UiWidget`, `CallbackContext`, `LlmRequest/Response`, `InMemorySessionService`, `InMemoryArtifactService`, `AgentEvaluator`, `Rubric`).
    - **Cloud Build Fix**: `python:3.12-slim-bookworm` non ha `git`, quindi il build syd-brain falliva durante `uv sync` perché `google-antigravity` (auto-iniettato dall'IDE Antigravity in `pyproject.toml` come dep git-sourced) tentava il clone. Rimossa la dep e il blocco `[tool.uv.sources]`. Revisione live: `syd-brain-00253-xch`.
    - **Webhook Header Rename**: `X-N8N-Timestamp` / `X-N8N-Signature` → `X-SYD-Timestamp` / `X-SYD-Signature` su `src/api/deps/webhook_auth.py`, `src/tools/n8n_mcp_tools.py`, `tests/unit/test_webhook_auth.py`. Il header `X-N8N-API-KEY` resta invariato (contratto upstream con n8n). Suite test: 431/431 pass (era 423 + 8 fail per header non sincronizzati).
    - **Supabase Migration**: Prima migrazione `20260401000000_enable_rls_n8n_tables.sql` committed in `supabase/migrations/`. Stabilita la cartella come source-of-truth per le modifiche schema Supabase.
    - **RAG Rate-Limit**: `RAGService.upsert_records()` ora usa batch da 50 (era 90) con sleep 8s tra batch per rispettare il limite 250k TPM di `multilingual-e5-large`. Aggiunto `scripts/merge_prezzario.py` per consolidare i 3 file part1/2/3 in `prezzario_lazio_2023_structured.json`.
    - **Gitignore Hardening**: Esclusi artifact runtime (`backend_python/data/*.{txt,html,pdf,log}`), Supabase CLI state (`supabase/.temp/`, `supabase/.branches/`) e `.git_status.txt`.

- **Phase 85b (Mag 20, 2026):** **Antigravity SDK & Dependency Ingestion (v4.4.4)** ⚠️ *deprecato in Phase 85c*:
    - **SDK Installation**: `google-antigravity` (`0.1.0`) era stato aggiunto come dep git-sourced. Rimosso in Phase 85c perché non importato da alcun modulo e causava il fallimento di Cloud Build (manca `git` nel container).
    - **Architectural Validation**: Compatibilità `google-adk` ↔ `google-antigravity` analizzata. Decisione iniziale: tier agentico su `google-adk 1.27.2`. Phase 85c ha bumpato a `2.2.0` per ragioni di sicurezza (CVE-2026-4810).


- **Phase 85a (Mag 10, 2026):** **RAG Pipeline Completion — Full Prezzario Lazio Ingestion (v4.4.3)**:
    - **Extraction**: `scripts/extract_prezzario.py --pages 101-195` completato. Estratti 1.361 articoli da pagine 101–195 (capitoli A14–A21: serramenti, porte, tinteggiature, impianti, viabilità, opere metalliche, bonifiche).
    - **Merge**: `scripts/merge_prezzario.py` ha merged part1 (657) + part2 (846) + part3 (1.361) → **2.859 articoli unici** con deduplicazione per `codice`.
    - **Ingestion**: `scripts/ingest_prezzario.py --wipe` completato. Namespace `prezzario` contiene 2.859 vettori (multilingual-e5-large, Pinecone Integrated Inference). Fix rate limiting: batch ridotto da 90→50 record, delay 8s tra batch per rispettare limite 250k TPM.
    - **Validation**: 51 categorie coperte (Demolizioni, Pavimenti, Serramenti, Tinteggiature, Impianti, Strutture, ecc.). Price range €0.32–€3,983.71. Search semantico operativo (test query "ristrutturazione bagno" ritorna articoli pertinenti).



- **Phase 84b (Mar 30 – Apr 1, 2026):** **RAG Eval Infrastructure + Skills Registry (v4.4.2)**:
    - **RAG Eval Script**: `scripts/eval_rag.py` — Ragas + Gemini-as-Judge (Vertex AI). Usa `RAGService.search()` namespace `prezzario`. Metriche: faithfulness (>0.80), answer_relevancy (>0.75), context_precision (>0.70), context_recall (>0.65). Exit code 1 se sotto soglia (CI-friendly). Argomenti: `--namespace`, `--top-k`, `--save`.
    - **Test Set**: `tests/evals/rag_test_set.json` — 30 domande con ground truth per tutte le categorie del Prezzario Lazio 2023 (demolizioni, pavimenti, tinteggiature, intonaci, serramenti, isolamenti, strutture, impianti, coperture, opere metalliche).
    - **Skill rag-pipeline-syd**: `.gemini/skills/rag-pipeline-syd/` — SKILL.md aggiornato con pipeline reale (Gemini extraction), INGESTION.md (Docling+BM25 hybrid upgrade), HYBRID_SEARCH.md, EVALUATION.md. Registrato in `SKILLS_REGISTRY.md`.

- **Phase 84a (Mar 29–30, 2026):** **n8n Cloud Run + Architecture Refactoring (v4.4.1)**:
    - **n8n Cloud Run**: 4 workflow attivati via `POST /api/v1/workflows/{id}/activate` (public API, non `PATCH`). Gmail SMTP App Password corretta (`6808 4361 7357 2917`). Supabase PostgreSQL (`db.ztswcobfxmlivmojsayn.supabase.co`). Nodi Telegram/Twilio rimossi (no credenziali). API key `claude-auto-3` in `memory/n8n_deploy_reminder.md`.
    - **Router Consolidation**: 9 router file spostati con `git mv` da `src/api/` a `src/api/routes/`. `main.py` import paths aggiornati. 4 test file corretti. `gemini_imagen.py` e `perplexity.py` lasciati in `src/api/` (non sono router).
    - **Firestore → Backend API**: `Testimonials.tsx`, `Portfolio.tsx`, `usePasskey.ts` migrati da direct Firestore reads ad API calls. Nuovo file `src/api/routes/content_routes.py` con `GET/POST /api/content/testimonials` e `GET /api/content/portfolio`. Nuovo endpoint `GET /passkey/check`.
    - **LangChain Cleanup**: `ORCHESTRATOR_MODE` default `langgraph` → `vertex_adk` in `config.py`. Docstring `CheckpointError` de-langgraphizzato.
    - **ADR-001 Exceptions**: `useChatHistory`, `ProjectFilesView`, `useUserPreferences` usano `onSnapshot` — NON migrati (realtime, documentato).

- **Phase 84 (Mar 29, 2026):** **Agent Skills Standardization (v4.4.0)**:
    - **Skill Integration**: ~30+ Agent Skills custom nella directory `skills/` per uniformare standard architetturali.
    - **Aree Coperte**: FastAPI enterprise, M3/Glassmorphism UI, RAG/Pinecone, N8n, TestSprite/E2E, GDPR security, ADK agent directives.

- **Phase 83 (Mar 29, 2026):** **RAG Pipeline & Pinecone Multi-Namespace**:
    - **Multimodal Extraction**: `scripts/extract_prezzario.py` — `gemini-2.5-flash` Vision, schema Pydantic (`codice`, `prezzo_euro`, `categoria`, ecc.), rate limit 4.5s/page.
    - **Namespace Segregation**: `prezzario` (listini strutturati) + `normative` (wiki/best-practice markdown).
    - **Idempotency**: ID = `sha256(codice.encode())`. `delete_namespace()` gestisce 404 silenziosamente.
    - **ADK Integration**: `search_prezzario`, `retrieve_price_by_code`, `retrieve_knowledge` operativi.

- **Phase 82b (Mar 23, 2026):** **Portfolio Admin Page + Cloud Run Deploy (v4.3.1)**:
    - **Portfolio Admin**: `pages/5_🖼️_Portfolio.py` list/add/edit, Firebase Storage upload → permanent URL.
    - **Service Layer**: `portfolio_repo.py` + `portfolio_service.py`.
    - **Cloud Run**: Live https://syd-admin-972229558318.europe-west1.run.app

- **Phase 82 (Mar 23, 2026):** **Admin Image Upload & Storage Infrastructure (v4.3.0)**:
    - `StorageService` + `POST /api/v1/admin/storage/signed-url`. `AdminImageUpload.tsx` + react-dropzone. Fixed H1 (fido2 2.1.1) + C3 (XSRF).

- **Phase 81e (Mar 22, 2026):** **Mobile UI Polish (v4.2.1)**:
    - Drag constraints `ChatToggleButton`, `env(safe-area-inset-*)`, Firebase `experimentalAutoDetectLongPolling`.

- **Phase 81d (Mar 22, 2026):** **Native RAG — Pinecone Integrated Inference (v4.2.0)**:
    - `multilingual-e5-large` Pinecone Serverless. `RAGService` + `rag_tools.py` aggiornati.

- **Phase 81c (Mar 22, 2026):** **Architecture Canonicalized (v4.1.5)**:
    - Rimosso multi-room-per-project. 1 stanza = 1 progetto. Commit `2d12faf`.

- **Phase 81b (Mar 21, 2026):** **Mobile Swipe + Batch Admin (v4.1.4)**. Commit `ed3fec5`.

- **Phase 81a (Mar 21, 2026):** **GDPR 3-Phase Lifecycle (v4.1.3)**:
    - `account_lifecycle_service.py`, Cloud Scheduler `0 3 * * *` Europe/Rome, 3 Firestore indexes READY. Commit `a7ef2fe`.

---

- **Current Version**: `v4.4.5`
- **Production Audit Status**: 51/51 items complete ✅
- **RAG Pipeline Status**: Prezzario Lazio 2023 (2.859 articoli) fully ingested ✅
- **Security Status**: Dependabot 0 alert aperti (post-Phase 85c, era 80). `npm audit` = 0 vulnerabilità. Backend test suite 431/431 ✅. ADK 2.x in produzione. Supabase RLS attivo su tabelle n8n ✅. GDPR lifecycle ✅. Secret-scanning: 1 alert aperto (Firebase Web API key in git history — chiave client-side protetta da App Check, non critica). n8n HMAC: `SYD_WEBHOOK_SECRET` non configurato su Cloud Run ⚠️
- **Architecture**: 1 stanza = 1 progetto → N progetti → 1 batch. ADR-001: onSnapshot exceptions documentate. Webhook HMAC headers vendor-neutral `X-SYD-*`.
- **Cloud Run Live**: `syd-brain-00253-xch` (backend, europe-west1) | `syd-admin` | `syd-n8n`
- **Admin Console**: https://syd-admin-972229558318.europe-west1.run.app
- **Next High Priority**: 1) Settare `SYD_WEBHOOK_SECRET` su Cloud Run (chiudere HMAC bypass) | 2) Eseguire `eval_rag.py` su namespace `prezzario` | 3) Chiudere alert secret-scanning Firebase API key | 4) Cookie Consent Banner (EU GDPR)
