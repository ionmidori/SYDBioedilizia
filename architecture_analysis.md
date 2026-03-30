# Analisi Architetturale del Progetto: website-renovation

## 1. Introduzione
L'analisi è stata condotta basandosi sulle direttive della **3-Tier Architecture** stabilite nel progetto e sui pattern definiti per **Next.js 16** e **Python FastAPI**. 
L'obiettivo è garantire una rigida separazione dei ruoli, scalabilità, manutenibilità e sicurezza del codice.

## 2. Analisi Backend (`backend_python`)

### Deviazioni dalle Best Practices
- **Violazione del Single Responsibility Principle in `main.py`:** Il file `main.py` ha raggiunto dimensioni notevoli (~664 righe). Oltre all'inizializzazione dell'app e alla complessa configurazione dei middleware, contiene logica di business e la definizione diretta di endpoint come `/chat/stream`, `/health` e `/ready`. Questo lo rende un "God Object" architetturale.
- **Inconsistenza nella Struttura dei Router:** I file di routing non sono strutturati in modo omogeneo. Alcuni si trovano nella cartella generica `src/api/` (es. `projects_router.py`, `chat_history.py`, `users_router.py`), mentre altri sono correttamente isolati in `src/api/routes/` (es. `quote_routes.py`, `batch_routes.py`). La convenzione di "Screaming Architecture" del progetto richiede che tutti i router seguano il path `src/api/routes/{domain}.py`.

### Punti di Miglioramento (Azioni)
1. **Refactoring di `main.py`:** 
   - Estrarre la logica di streaming chat e il relativo endpoint in `src/api/routes/chat_routes.py`.
   - Estrarre `/health` e `/ready` in `src/api/routes/health_routes.py`.
   - `main.py` deve limitarsi a fungere da punto di ingresso per i middleware e l'inclusione ordinata dei router tramite `app.include_router(...)`.
2. **Consolidamento dei Router:** Spostare tutti i file `.py` attualmente in `src/api/` (escludendo le cartelle di modulo) all'interno di `src/api/routes/`.
3. **Isolamento Logica di Dominio:** Assicurarsi che tutta la logica (es. la persistenza pre-stream del messaggio utente su Firestore) venga rimossa dal layer dei router e delegata al livello Service (`src/services/`).

## 3. Analisi Frontend (`web_client`)

### Deviazioni dalle Best Practices
- **Accesso Diretto al Database (Violazione della 3-Tier Law):** Nonostante l'adozione corretta di chiamate API strutturate (es. `projects-api.ts`), l'analisi ha rivelato che il frontend continua a importare direttamente l'oggetto `db` da `lib/firebase.ts` per effettuare query lato client da React Components e Hooks. 
  - Componenti/Hooks coinvolti: `useUserPreferences.ts`, `usePasskey.ts`, `ProjectFilesView.tsx`, `Testimonials.tsx`, `Portfolio.tsx`.
  - Questo costituisce una chiara violazione della regola stabilita: *"FORBIDDEN: direct DB calls (unless via Server Actions wrapping API calls)"*. L'unica eccezione ammissibile lato client riguarda `storage` e `auth`, mentre per Firestore (`db`) dovrebbe esserci uno scudo backend.

### Punti di Miglioramento (Azioni)
1. **Migrazione Fetching al Backend:** Il recupero dei dati per sezioni come "Testimonials", "Portfolio" e per le "Preferenze Utente" deve essere migrato, interrogando esclusivamente le API Python FastAPI, vera "Single Source of Truth".
2. **Uso Avanzato dei Server Components:** Sfruttare i React Server Components (RSC) nativi di Next.js 16 per compiere queste interrogazioni al backend lato server durante il render iniziale, eliminando logica di fetching lato client laddove non esista interazione diretta utente (soprattutto su `Portfolio` e `Testimonials`).

## 4. Verifica Integrazione (ADK & Sync)

- **Golden Sync (Data Contract):** Il frontend utilizza bene librerie come Zod (es. `lib/validation/project-list-schema.ts`) per convalidare in sicurezza i payload provenienti da Pydantic. Questo standard è un'eccellenza che dev'essere mantenuta.
- **Residui Legacy (LangChain):** Nonostante LangGraph e LangChain siano stati vietati e rimossi permanentemente (in favore di Google ADK e `google.genai` nativo), si segnalano alcuni residui nei commenti e script (es. `scripts/ingest_docs.py`, file di Test). Si suggerisce un `grep` accurato per ripulire queste referenze, al fine di evitare ambiguità per gli sviluppatori in ingresso.

## 5. Conclusione
Il progetto presenta una struttura solida orientata alla modernità (Next.js 16 e FastAPI ADK), ma necessita di un intervento di **refactoring disciplinare** su due fronti cruciali: 
1. Ripristinare il boundary netto tra Presentation Layer (Next.js) e Data Layer (Firebase) rimuovendo le chiamate dirette a Firestore dal frontend.
2. Decongestionare il file `main.py` e consolidare l'esposizione delle API FastAPI rispettando la Separation of Concerns e l'isolamento dei domini.