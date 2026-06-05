# PROJECT CONTEXT SUMMARY (v4.4.4)
**Ultimo aggiornamento:** 20 Maggio 2026 (Phase 85b)
**Status:** Production-Ready — RAG Pipeline Complete + Prezzario Lazio 2023 Ingested + google-antigravity SDK installed for local testing

## 🎯 Obiettivi Correnti (Phase 85b)
1. **RAG Eval da Eseguire**: `eval_rag.py` + `rag_test_set.json` pronti. Richiede `uv add ragas langchain-google-vertexai datasets`, poi `uv run python scripts/eval_rag.py`. Namespace `prezzario` ora contiene 2.859 vettori (setup completo).
2. **google-antigravity SDK**: Installato per testing locale. Logica di produzione legata stabilmente a `google-adk` (1.27.2).
3. **n8n Live**: 4 workflow attivi. Gmail SMTP configurato. SYD_WEBHOOK_SECRET non ancora settato su Cloud Run (HMAC bypass attivo — dev mode warning).
4. **Admin Console**: https://syd-admin-972229558318.europe-west1.run.app
5. **Cookie Consent Banner (EU GDPR)**: Non ancora implementato.
6. **Knowledge Distillation**: Namespace `normative` (5 chunks, legacy test data) — mantiene sample data per validazione.

---

- **Phase 85b (Mag 20, 2026):** **Antigravity SDK & Dependency Ingestion (v4.4.4)**:
    - **SDK Installation**: Added `google-antigravity` (`0.1.0`) from Git repository. Updated `pyproject.toml` and `uv.lock`.
    - **Architectural Validation**: Analyzed compatibility between `google-adk` and `google-antigravity`. Established that the core agentic tier will continue using `google-adk` (version `1.27.2`) for Vertex AI integration (CMEK, EU region), keeping `google-antigravity` for local prototyping.


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

- **Current Version**: `v4.4.3`
- **Production Audit Status**: 51/51 items complete ✅
- **RAG Pipeline Status**: Prezzario Lazio 2023 (2.859 articoli) fully ingested ✅
- **Security Status**: Backend 0 CVEs. Frontend 0 High/Critical. GDPR lifecycle ✅. Supabase RLS ✅. n8n HMAC: SYD_WEBHOOK_SECRET non configurato su Cloud Run ⚠️
- **Architecture**: 1 stanza = 1 progetto → N progetti → 1 batch. ADR-001: onSnapshot exceptions documentate.
- **Admin Console**: https://syd-admin-972229558318.europe-west1.run.app
- **Next High Priority**: 1) Eseguire `eval_rag.py` su namespace `prezzario` | 2) Settare `SYD_WEBHOOK_SECRET` su Cloud Run | 3) Cookie Consent Banner (EU GDPR)
