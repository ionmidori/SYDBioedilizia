# 🏗️ Architecture Migration Plan: Next.js to Python (Split-Stack)

> **Obiettivo**: Porting della logica AI da Node.js (`ai_core`) a un backend Python dedicato (FastAPI + LangGraph), mantenendo Next.js come frontend e proxy di autenticazione.
> **Philosophy**:Zero Bugs Policy. Ogni fase deve essere testata e verificata prima di passare alla successiva.

---

## 📅 Roadmap di Migrazione (Granulare)

### ✅ Fase 0: Setup Ambiente & Infrastruttura (Locale)
*Obiettivo: Avere un ambiente Python moderno, isolato e riproducibile.*

- [ ] **0.1. Struttura Directory**: Creare `backend_python/` nella root.
- [ ] **0.2. Dependency Management (Best Practice: `uv`)**:
  - Inizializzare progetto con `uv init`.
  - Configurare `pyproject.toml` con Python 3.12+.
- [ ] **0.3. Git Hygiene**: Aggiornare `.gitignore` root per escludere `.venv`, `__pycache__`, `.env` di Python.
- [ ] **0.4. Hello World**: Creare un semplice script `main.py` per verificare che l'interprete funzioni.

### 🧱 Fase 1: Core API Foundation
*Obiettivo: Un server HTTP funzionante deployabile su Cloud Run.*

- [ ] **1.1. FastAPI Boilerplate**:
  - Installare `fastapi`, `uvicorn[standard]`.
  - Creare `app = FastAPI()` in `main.py`.
- [ ] **1.2. Health Check**: Implementare `GET /health` che restituisce `{"status": "ok"}`.
- [ ] **1.3. Dockerization**:
  - Scrivere `Dockerfile` ottimizzato (Multi-stage build non necessaria per Python semplice, ma usare `python:3.12-slim`).
  - Configurare `uv` nel Dockerfile per installazione veloce.
- [ ] **1.4. Local Run Script**: Creare uno script `dev.ps1` (o `.sh`) per lanciare il server con hot-reload.

### 🌊 Fase 2: Protocollo di Streaming (Critico)
*Obiettivo: Il backend Python deve "parlare" la lingua di Vercel AI SDK.*

- [ ] **2.1. Vercel Adapter Logic**:
  - Creare `src/streaming/vercel.py`.
  - Implementare generatore: Input `AsyncIterable[str]` -> Output `Bytes` (formato `0:"text"\n`).
- [ ] **2.2. Unit Test Protocollo (Zero Bugs)**:
  - Creare `tests/test_streaming.py` con `pytest`.
  - Testare casi limite: newlines, quote, caratteri speciali, emoji.
  - **NON PROCEDERE** finché i test non passano al 100%.

### 🔐 Fase 3: The Security Bridge (Auth Handoff)
*Obiettivo: Autenticazione sicura tra Next.js e Python senza latenza Firebase.*

- [ ] **3.1. Shared Secrets**:
  - Definire `INTERNAL_JWT_SECRET` in `.env.local` (Next.js) e `.env` (Python).
- [ ] **3.2. Python Middleware**:
  - Implementare dipendenza `verify_internal_token` in FastAPI.
  - Deve decodificare HS256 JWT e estrarre `uid` ed `email`.
- [ ] **3.3. Next.js Token Minter**:
  - Creare utility in TS per generare token brevi (5 min) usando la stessa secret.
  - Testare la generazione (TS) e validazione (Python) manualmente.

### 🧠 Fase 4: Porting degli Strumenti ("The Brain" - Parte 1)
*Obiettivo: Migrare la logica di business da `ai_core` (TS) a Python.*

- [ ] **4.1. Configurazione Google Cloud**:
  - Setup `google-cloud-aiplatform` (Vertex AI).
  - Configurare credenziali locali (`application_default_credentials.json`).
- [ ] **4.2. Tool: Perplexity (Search)**:
  - Porting di `ai_core/src/lib/perplexity.ts`.
  - Usare `httpx` (async) per le chiamate API.
  - Definire Pydantic Models per Input/Output.
- [ ] **4.3. Tool: Imagen (Generazione)**:
  - Setup SDK Vertex AI Image Generation.
  - Porting logica prompt enhancement.
- [ ] **4.4. Quota System**:
  - Porting `ai_core/src/tool-quota.ts` su Firestore (Python Admin SDK).
  - Assicurarsi che le quote siano lette/scritte atomicamente.

### 🤖 Fase 5: Orchestrazione (LangGraph)
*Obiettivo: Sostituire la logica imperativa TS con un grafo di agenti.*

- [ ] **5.1. Definizione Grafo**:
  - Creare `src/agent/graph.py`.
  - Definire nodi: `Router`, `Generator`, `Tools`.
- [ ] **5.2. Integrazione Gemini**:
  - Configurare `ChatVertexAI` con `langchain-google-vertexai`.
- [ ] **5.3. Memory**:
  - Implementare `Checkpointer` (può essere in-memory per MVP o Postgres/Firestore per persistenza).

### 🌉 Fase 6: Integrazione Frontend ("The Switch")
*Obiettivo: Collegare Next.js al nuovo cervello.*

- [ ] **6.1. Route Handler Update**:
  - Modificare `web_client/app/api/chat/route.ts`.
  - Rimuovere logica vecchia (`streamText` locale).
  - Inserire logica Proxy (Fetch a Python + Pipe response).
- [ ] **6.2. Smoke Test**:
  - Chat semplice "Ciao".
  - Generazione Immagine (test tool).
  - Verifica Stream fluido.

---

## 🛠️ Tecnologie Scelte (Best Practices)

| Ruolo | Tecnologia | Motivazione |
|-------|------------|-------------|
| **Runtime** | Python 3.12 | Performance e typing moderno. |
| **Package Manager** | **uv** | 100x più veloce di Poetry/Pip, gestisce anche l'installazione di Python. |
| **Web Framework** | **FastAPI** | Standard de-facto, async nativo, validazione Pydantic automatica. |
| **LLM Framework** | **LangGraph** | Controllo granulare sui loop dell'agente (meglio di LangChain "Chain"). |
| **Testing** | **pytest** | Semplice, potente, fixture-based. |
| **Linter** | **Ruff** | Linter/Formatter velocissimo (scritto in Rust). |

---

## ⚠️ Punti di Attenzione (Risk Management)

1.  **Timeouts**: Cloud Run scala a zero. La prima richiesta potrebbe andare in timeout se Next.js aspetta solo 10s.
    *   *Mitigazione*: Impostare timeout fetch Next.js a 60s+.
2.  **Memory Leaks**: Python non gestisce la memoria come V8.
    *   *Mitigazione*: Evitare variabili globali che accumulano stato chat. Usare Redis/Firestore per la history.
3.  **Typing Mismatches**: TS e Python gestiscono i JSON diversamente.
    *   *Mitigazione*: Usare Pydantic in modo aggressivo ("Strict Mode") per validare ogni input dal frontend.
