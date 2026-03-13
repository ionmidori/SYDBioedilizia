# PROJECT CONTEXT SUMMARY (v4.0.20)
**Ultimo aggiornamento:** 13 Marzo 2026 (Phase 67)
**Status:** Production-Ready — Frontend Dead Code Cleanup & Build Hardening

## 🎯 Obiettivi Correnti (Phase 67)
1.  **Frontend Code Hygiene**: Rimozione codice morto orfano identificato tramite analisi `knip`.
2.  **Dead Exports Elimination**: Pulizia esportazioni non utilizzate nelle utility interne del frontend (es. `formatFileSize`, `isSafeUrl`, ecc.).
3.  **Build Hardening**: Risoluzione errori di importazione mancanti da `firebase-admin` e validazione della Next.js build.
4.  **GDPR Compliance Prep**: Preparazione per il cron job di pulizia ADK Session.

---

- **Phase 67 (Mar 13, 2026):** **Frontend Dead Code Cleanup & Build Hardening (v4.0.20)**:
    - **Dead Code Elimination**: Eliminati file orfani individuati da `knip` (es. `GlobalFileUploader.tsx`, vecchi tipi `lead.ts`).
    - **Dead Export Cleanup**: Rimosse utility interne esportate ma mai consumate in `compression-utils.ts`, `api-client.ts`, `security.ts` e `profile.ts`.
    - **Firebase Admin SDK Sync**: Ripristinato export `getFirebaseAuth` e `getFirestoreDb` in `firebase-admin.ts` per supportare la generazione lato server.
    - **Build Check**: Completata con successo una build di produzione (Turbopack) pulita, confermando assenza di errori di type-checking ed ESLint warning bloccanti.

- **Phase 66 (Mar 12, 2026):** **Dashboard UX & Recent Media (v4.0.19)**:
    - **Recent Media Carousel (MediaCarousel.tsx)**: Implementata sezione "Media Recenti" stilizzata M3/Bento. Recupera in tempo reale gli asset tramite `useGalleryAssets`.
    - **Project Controls Fix (ProjectCard.tsx)**: Spostati pulsanti Rinomina/Elimina per evitare sovrapposizioni. Implementato `stopPropagation` per fixare il routing collision negli eventi clic.
    - **Bento Grid Extension (globals.css)**: Espanso il layout della griglia bento per accogliere la nuova area media su tutte le viewport.
    - **Dependencies**: Installata `date-fns` per la localizzazione italiana avanzata delle date nel frontend.

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

---

- **Current Version**: `v4.0.20`
- **Next High Priority**: 1) ADK Session cleanup cron for GDPR retention | 2) Replace remaining `Loader2` imports with `SydLoader` | 3) Automate Golden Sync | 4) Granular token-based rate limiting
