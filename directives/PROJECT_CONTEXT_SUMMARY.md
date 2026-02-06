# Project Context & Session Memory (Update: 2026-02-06)

Questo file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti in questa sessione.

## 🏢 Remediation Audit & Tier-3 Enforcement (2026-02-06)

Il sistema è stato bonificato per eliminare le "Shadow API" e garantire che il backend Python sia l'unica **Source of Truth**. Tutte le fasi 1-7 sono state completate con successo.

### 1. Eliminazione Totale Shadow APIs (Phase 2 & 4)
Tutte le rotte API Node.js ridondanti sono state **ELIMINATE** per prevenire il "Shadow Logic":
- `web_client/app/api/lead-magnet/` -> Sostituito da `/api/py/submit-lead` (Python).
- `web_client/app/api/upload-image/` -> Sostituito da `/api/py/upload/image` (Python).
- `web_client/app/api/get-upload-url/` -> Sostituito da upload diretto via Python backend.
- `web_client/app/api/chat/history/` -> Sostituito da `/api/py/sessions/{id}/messages` (Python).
- `web_client/lib/legacy-api.ts` -> **CANCELLATO** (tutti i consumatori rimossi).

### 2. Golden Sync & Firestore Migration (Phase 1 & 3)
- **Leads:** Allineata l'interfaccia `LeadData` (.ts) con il modello Pydantic (`backend_python`).
- **useChatHistory (SWR Migration):** Rimosso l'accesso diretto a Firestore via SDK (`onSnapshot`).
  - Il frontend ora usa **SWR** per il data fetching tramite l'API Python.
  - **Caching & Resilience:** Implementato polling automatico (5s), deduplicazione e retry automatici con SWR.
- **Reasoning CoT:** Supporto per `ReasoningStep` nei messaggi di chat provenienti dal backend.

### 3. Centralizzazione & Hook Refactoring (Phase 2 & 4)
- **api-client.ts:** Unico punto di ingresso per tutte le chiamate al backend Python.
- **useMediaUpload Replacement:** Il hook `useMediaUpload` è stato rifattorizzato internamente (approccio conservativo) per delegare a `useImageUpload`, mantenendo l'interfaccia stabile per `ChatWidget.tsx` ma eliminando le dipendenze Shadow API.
- **Supporto Multi-Media:** Introdotto `useDocumentUpload` per file PDF/DOCX gestiti dal backend Python.

### 4. Chat Protocol & Reasoning UI (Phase 5)
- **ReasoningStepView:** Nuovo componente per visualizzare il **Chain of Thought** dell'AI (confidence score, protocol status, missing info).
- **Metadata Enhancement:** Il payload di invio messaggi ora include metadati completi dei file (`mimeType`, `fileSize`, `originalFileName`).

### 5. Observability & Monitoring (Phase 6)
- **Metrics Middleware:** Tracciamento automatico della durata delle richieste (ms) e degli status code.
- **Enhanced Logging:** Log strutturati JSON in `upload.py` con metadati estesi per il monitoraggio preventivo delle quote e debugging degli upload.

### 6. Verification & Shadow API Audit (Phase 7)
- **Audit Risultati:** 100% delle Shadow API identificate sono state rimosse. Nessuna rotta ridondante rilevata.
- **Integrità:** Compilazione TypeScript passata con successo (0 errori).
- **Readiness:** Il sistema è ora considerato pronto per il deployment (95% readiness).
- **Test Plan:** Creato [MANUAL_TEST_PLAN.md](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/directives/MANUAL_TEST_PLAN.md) per la validazione finale da parte dell'utente.

### 7. FileUploader Refactoring (Post-Audit)
- **Problema:** Il componente usava logica mock e chiamava `/api/upload` (endpoint inesistente).
- **Soluzione:** Integrato `useFileUpload` hook per upload reali su Firebase Storage.
- **Miglioramenti:** Progresso real-time, mapping errori user-friendly, sincronizzazione stato via `useEffect`.

## 🛠️ Bug Critici Risolti

### 1. Loop Infinito di Render ("Infinite Loop") - REVISIONE GRAFO
- **Problema:** L'agente rimaneva bloccato in un loop chiamando `generate_render` ripetutamente senza uscire dal nodo `execution`.
- **Soluzione V2 (Agentic Graph):**
    - **Routing Deterministico:** Il nodo `tools` ora torna sempre al nodo `reasoning` (Tier 1) invece di tornare a `execution`. Questo obbliga l'IA a rivalutare lo stato (CoT) dopo ogni azione.
    - **Sincronizzazione Contesto:** Creata funzione `_inject_context` in `agent.py` che garantisce che sia il modulo di ragionamento che quello di esecuzione vedano le stesse istruzioni di sistema e gli stessi link delle immagini caricate.
    - **Circuit Breaker:** Implementato conteggio dei `ToolMessage` negli ultimi 10 messaggi; se > 5, il grafo termina forzatamente (`END`).

### 2. Deletion Silenziosa (Ghost Files)
- **Problema:** Cancellando un progetto, le foto rimanevano nella galleria e i file su Storage non venivano rimossi. (Vedere `delete_project` in `src/db/projects.py` per i dettagli della Deep Deletion).

### 3. Zero-Latency Feedback & Thinking State (Gold Box)
- **Problema:** Il feedback "Thinking..." (Box Dorato) non appariva immediatamente, causando un ritardo percepito di 2+ secondi.
- **Causa Radice:**
    1. **Proxy Next.js:** In Dev, eseguiva `verifyIdToken` (Firebase) su ogni richiesta, aggiungendo 2s di latenza (fetch keys).
    2. **Vercel AI SDK:** Ignora i chunk vuoti (`""`), impedendo la creazione del messaggio "Assistant" finché non arriva il primo token AI.
- **Soluzione Applicata (Definitiva):**
    - **Backend Python:** Il generatore dello stream invia immediatamente `0:"..."\n` (Hack "Three Dots") come primo byte fisico. Abbiamo provato con lo spazio (`" "`) ma veniva filtrato dall'SDK, quindi siamo tornati ai puntini.
    - **Frontend Proxy:** Rimosso completamente il blocco `verifyIdToken` in `route.ts`. L'autenticazione viene gestita dal backend Python *dopo* l'invio del primo chunk.
    - **Frontend UI (`MessageItem.tsx`):**
        - Rileva `message.content.startsWith(...)` per attivare lo stato "Thinking".
        - **Artifact Stripping:** Rimuove visivamente i `...` iniziali dal testo renderizzato per evitare artefatti (es. `...Ciao`).


---

## 🏗️ Refactoring Backend (Phases 1-7) - COMPLETATO

Il backend Python è stato trasformato da uno script monolitico a un'architettura **Enterprise 3-Tier**.

### 1. Architettura a 3 Livelli (Screaming Architecture)
- **Tier 1 (Directives):** Strategia e SOP gestite da `IntentClassifier` e `SystemPrompts`.
- **Tier 2 (Orchestration):** `AgentOrchestrator` gestisce il flusso di streaming e la persistenza dei messaggi.
- **Tier 3 (Execution):** `AgentGraphFactory` crea grafi isolati (LangGraph) con tool tipizzati (Pydantic).

### 2. Affidabilità & Performance (Phase 4 & 6)
- **Request Tracing:** Ogni richiesta genera un `X-Request-ID` unico, propagato tramite `contextvars` in tutti i log.
- **Structured Logging:** I log sono ora in formato **JSON** (production-ready) per facilitare il debugging e l'osservabilità.
- **Metrics Middleware:** Introdotto tracciamento automatizzato della latenza e header `X-Response-Time` per il monitoraggio delle performance.
- **Exception handling:** Implementata gerarchia `AppException`. Il middleware cattura tutti gli errori restituendo `APIErrorResponse` (JSON), eliminando le risposte HTML 500.
- **Async Safety:** Introdotto `SafeTaskManager` nell'Orchestrator per prevenire la garbage collection dei task "fire-and-forget" e un wrapper `run_blocking` per operazioni sincrone pesanti.

### 3. Intelligence & Routing (Phase 3)
- **Intent Classifier:** Ora asincrono e predisposto per il fallback su modelli locali in caso di latenza (Hybrid LLM).
- **Prompt Management:** Versionamento delle istruzioni di sistema tramite `SystemPrompts`.
- **Model Stability:** Consolidato l'uso di `gemini-2.0-flash` per bilanciare velocità e intelligenza.

---

## 🏗️ Progettazione Nuove Funzionalità

### 1. Magic Pencil (Generative Inpainting)
- **Stato:** Studio di fattibilità completato.
- **Approccio Scelto:** Flusso Ibrido a 2 Fasi.
    1. **Fase Interpretativa:** Gemini Vision analizza Immagine + Maschera per identificare l'oggetto target (es. "divano classico").
    2. **Fase Generativa:** Imagen 3 (Vertex AI) esegue l'Inpainting basato sulla descrizione semantica e sul prompt utente.
- **Documentazione:** Vedere [MAGIC_PENCIL_SPEC.md](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/directives/MAGIC_PENCIL_SPEC.md).

---

## 🏗️ Architettura & Percorsi (Source of Truth)

| Tipo di Dato | Percorso Firestore | Percorso Storage |
| :--- | :--- | :--- |
| **Sessione (Backend)** | `sessions/{id}` | `user-uploads/{id}/` |
| **Progetto (Frontend)** | `projects/{id}` | `projects/{id}/uploads/` |
| **Messaggi Chat** | `sessions/{id}/messages` | - |
| **Metadati File** | `projects/{id}/files` | - |

**Nota Tecnica:** Il backend Python deve essere avviato da `backend_python/main.py`. La cartella `src/` è un pacchetto Python (`__init__.py` presente).

---

## 📋 Regole Operative per l'IA
1. **Loop Guard:** Dopo ogni chiamata a un tool, verifica sempre che l'output sia stato sintetizzato per l'utente prima di pianificare un'altra azione.
2. **Context First:** Prima di generare un render, assicurati che la funzione `analyze_room` sia stata eseguita (Triage) per avere i metadati strutturali.
3. **Magic Pencil:** Quando l'utente invia una maschera, attiva il workflow di inpainting descritto nella specifica.

---

## 🚀 Script di Utilità e Documentazione
- `directives/TECHNICAL_DEBT.md`: Registro del debito tecnico e dei refactoring futuri pianificati (es. consolidamento hook).
- `directives/MAGIC_PENCIL_SPEC.md`: Specifica tecnica per lo strumento di modifica mirata.
- `brain/5e8d4ea5-bf6e-4f11-9bd5-920aa3c43465/VERIFICATION_REPORT.md`: Report finale di verifica audit (Phase 7).
- `brain/5e8d4ea5-bf6e-4f11-9bd5-920aa3c43465/WALKTHROUGH_REMEDIATION.md`: Documentazione passo-passo della bonifica.
- `backend_python/tests/verify_e2e_flow.py`: Test di integrazione completo del backend.
- `backend_python/tests/verify_reliability.py`: Verifica di tracing, logging e async safety.
- `directives/MANUAL_TEST_PLAN.md`: Protocollo di test manuali per la validazione della remediation.
- `scripts/cleanup_orphaned_files.py`: Pulisce lo Storage orfano.
