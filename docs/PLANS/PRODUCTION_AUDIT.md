# SYD Bioedilizia - Production Readiness Audit & Checklist (2026)

Questo documento rappresenta l'audit definitivo e la checklist professionale prima della messa in produzione del progetto **SYD Bioedilizia**. Unisce le direttive interne (Golden Sync, 3-Tier Law), le skill di sicurezza Enterprise (OWASP, NIST) e le best practices aggiornate per lo stack Next.js 16 (App Router), FastAPI, Google ADK (Vertex AI) e Firebase.

---

## 1. Architettura & "3-Tier Law"

### Tier 1: AI Orchestration (Google ADK)
- [ ] **Nessun God Object:** Verificare che `src/adk/agents.py` e `src/adk/tools.py` siano sotto le 200 righe.
- [ ] **Native ADK Tools:** Confermare che tutti gli strumenti AI usino il pattern `FunctionTool(func)` e che le definizioni `async def` includano Docstring esplicite e type hints accurati.
- [ ] **LangChain Archiviato:** Eseguire uno scan del branch di produzione per garantire l'assenza assoluta di dipendenze `langchain`, `langgraph` o `langchain-core` (`grep -r "langchain" .`).
- [ ] **Modelli Minimi:** Verificare che nessun fallback utilizzi versioni antecedenti a `gemini-2.5-flash`.
- [ ] **Protezione Prompt Injection:** Implementare pattern *Sandwich Defense* (istruzioni di base collocate *dopo* l'input dell'utente) e delimitatori netti per gli input non sicuri nei prompt ADK.
- [ ] **Isolamento Rete (SSRF):** Se i tool effettuano richieste esterne (es. `market_prices.py` via Perplexity), verificare che puntino esclusivamente a domini in whitelist.

### Tier 2: Frontend UI (Next.js 16)
- [ ] **RSC by Default:** Controllare che la direttiva `"use client"` sia usata esclusivamente sulle "foglie" dell'albero dei componenti (pulsanti, form, hook interattivi).
- [ ] **Bundle Size:** Assicurarsi che le librerie pesanti di animazione (Framer Motion) siano lazy-loaded o ottimizzate (`m3-motion.ts`).
- [ ] **UI Non-Bloccante:** Nessuna operazione di I/O o fetch sincrona nei client components. Usa `useSWR` in combinazione con un caching esplicito `{ cache: 'force-cache' }` per dati immutabili.
- [ ] **Image Optimization:** Confermare l'uso di `NextImage` con `priority` per gli asset LCP (Largest Contentful Paint) e conversioni in WebP/AVIF.

### Tier 3: Backend Execution (FastAPI)
- [ ] **Screaming Architecture:** Confermare l'organizzazione delle route per Dominio in `src/api/routes`.
- [ ] **Async Hygiene:** Controllare che ogni operazione I/O sia `async def`. Tutte le elaborazioni gravose su CPU (es. generazione PDF o manipulation di immagini) **devono** essere avvolte in `run_in_threadpool`.
- [ ] **Concorrenza Sicura:** Sostituire vecchi pattern `asyncio.create_task` con `asyncio.TaskGroup` per gestire i task interni in parallelo con cancellazione a cascata.

---

## 2. Il "Golden Sync" (Contratti Dati)

- [ ] **Parità dei Modelli (1:1):** Effettuare un audit incrociato tra i modelli Pydantic in `backend_python/src/core/schemas.py` e le interfacce TypeScript in `web_client/types/`. 
- [ ] **Validazione Rigida (Pydantic V2):** Tutti i modelli Pydantic devono avere `model_config = {"extra": "forbid"}` per prevenire iniezioni di parametri (Parameter Pollution).
- [ ] **Validazione Frontend:** Tutte le risposte API e le Server Actions in Next.js devono essere passate attraverso parse e validazione **Zod** prima di interagire con il database o la UI. Nessun *type assertion* (`as unknown`) cieco.

---

## 3. Sicurezza (Security Hardening)

### Headers & CSP
- [ ] **CSP Restrittivo:** Configurare nel `middleware.ts` (Next.js) o `security_headers.py` (FastAPI) un Content Security Policy rigoroso.
  - Nessun `'unsafe-inline'` per script (usare nonce generati dinamicamente).
  - Inserire `block-all-mixed-content` e `upgrade-insecure-requests`.
- [ ] **FastAPI Middleware:** Garantire la presenza degli header: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

### Autenticazione & API
- [ ] **JWT Claims:** L'handler `verify_token` deve validare esplicitamente le *claims* `iss`, `aud` e `exp`.
- [ ] **Rate Limiting Globale:** Verificare che `middleware/metrics.py` o un `Limiter` (es. slowapi) imponga tetti per IP/Utente (es. 30/min per chat, 5/h per preventivi).
- [ ] **Prevenzione CSRF:** Next.js Server Actions lo gestiscono nativamente, ma verificare eventuali webhook esterni (es. N8N) tramite firma HMAC-SHA256.

### Firebase / Infrastruttura
- [ ] **Firebase App Check:** **Obbligatorio**. Controllare che `NEXT_PUBLIC_ENABLE_APP_CHECK=true` e che il middleware backend `app_check.py` respinga le request prive del token App Check.
- [ ] **Zero-Trust Firebase Rules:** Verificare `firestore.rules` e `storage.rules`. Il Default Rule **deve** essere `allow read, write: if false;`. Consentire l'accesso solo con logica Ownership: `request.auth.uid == resource.data.userId`.
- [ ] **Soft-Delete:** Nessuna eliminazione hard nel database per i dati critici (Preventivi/Progetti). Usare `status="deleted"`.

---

## 4. Osservabilità, Limitazioni e AI Quotas

- [ ] **Structured Logging:** I log (tramite `structlog`) devono essere emessi in JSON con `request_id` iniettato per tracing tra microservizi.
- [ ] **Protezione PII:** Verificare che il decoratore di tracciamento (`@trace_span`) abbia il flag `log_args=False` di default per evitare l'esposizione di Dati Personali Identificabili (PII) o segreti nei log.
- [ ] **AI Quotas:** Prima delle chiamate costose a Vertex AI o Imagen, eseguire il check in Firestore tramite `tools/quota.py`. Deve esistere un fallback UI esplicito qualora il limite mensile sia raggiunto (Gestione HTTP 429).
- [ ] **Gestione Errori JSON:** Controllare che l'Exception Handler globale in FastAPI non restituisca mai messaggi di errore grezzi o *stack trace*, ma solo `{"error_code": "...", "message": "..."}`.

---

## 5. Performance e Test (The "Launch Constraints")

- [ ] **Bundle & Core Web Vitals:** Eseguire `npm run build` e analizzare la dimensione del bundle. Nessun chunk JavaScript dovrebbe superare i 150kb (Gzipped).
- [ ] **Latenza Streaming AI:** First-token latency non deve superare i 2 secondi (tenendo presente il buffering interno di Google ADK 1.26).
- [ ] **Zero TypeError Policy:** 
  - Eseguire `npm run type-check` in frontend: deve restituire 0 errori.
  - Eseguire `uv run pyright src/` in backend: deve restituire 0 errori.
- [ ] **Automated Test Coverage:**
  - Eseguire `uv run pytest tests/unit/`. Verifica copertura > 70%.
  - Nessuna chiamata reale ai servizi esterni durante gli Unit Test (utilizzo di `pytest-mock`).

---

## Risultati Ricerca Web: Ulteriori trend per il 2026 aggiunti al protocollo

Durante l'audit sono stati integrati i seguenti elementi chiave, che risultano essere fondamentali per uno stack Next.js/FastAPI nel 2026 e assenti dai workflow basilari:
1. **Nonce Injector per Server Actions**: È imperativo usare crittografia per generare Nonce nel Middleware Next.js per rendere effettiva la CSP.
2. **Asymmetric JWT Verification in Backend**: Oltre a validare la forma del token, FastAPI deve scaricare e cacare le chiavi pubbliche di Firebase per una validazione crittografica RSA a monte.
3. **App Check in Backend Strict Mode**: Il servizio Firebase App Check non deve essere solo client-side, ma deve essere forzato in **Strict Mode** sul cloud in modo che qualsiasi curl o client non autorizzato venga bannato dall'Edge Load Balancer senza mai raggiungere il server FastAPI.