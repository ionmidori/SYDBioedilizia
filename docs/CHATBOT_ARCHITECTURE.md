# 🗺️ Mappa dell'Architettura del Chatbot (v3.0)

Questo documento delinea la struttura del sistema **SYD Bioedilizia**, mappando la logica ai file specifici dopo la completa ristrutturazione in un'architettura **Enterprise 3-Tier**.

## 🟢 1. Livello Orchestrazione Frontend (`web_client`)

Gestisce l'interfaccia utente, lo streaming e la gestione dello stato client.

| Componente | Percorso File | Funzionalità |
| :--- | :--- | :--- |
| **Widget UI** | `components/chat/ChatWidget.tsx` | Contenitore principale. Gestisce caricamento media e interazione. |
| **Logic Hook** | `hooks/useChat.ts` | Gestisce lo stream del Vercel Data Stream Protocol (0:, 9:, a:, 3:). |
| **Proxy Server**| `app/api/chat/route.ts` | Pass-through verso il backend Python. Gestisce Auth & App Check. |

---

## 🐍 2. Livello Intelligence Backend (`backend_python`)

Il "Cervello" del sistema (denominato **SYD Brain**), basato su **FastAPI**, **LangGraph** e un sistema di orchestrazione asincrono.

### 🧠 Tier 1: Directives (Strategy & SOP)
*Componenti: `src/services/intent_classifier.py`, `src/prompts/system_prompts.py`*

Prima di agire, il sistema analizza l'intento dell'utente.
- **Intent Classifier**: Decide se la richiesta è Chat, Azione o Comando.
- **System Prompts**: Gestisce le istruzioni versionate e il contesto dinamico (tramite `ContextBuilder`).

### 📡 Tier 2: Orchestration (Service Layer)
*Componenti: `src/services/agent_orchestrator.py`, `src/repositories/`*

Gestisce il ciclo di vita della richiesta e lo streaming verso il frontend.
- **Agent Orchestrator**: Coordina l'esecuzione del grafo, gestisce i task in background e lo streaming del Vercel Protocol.
- **Conversation Repository**: Astrae la persistenza (Firestore), gestendo sessioni e cronologia messaggi.

### ⚔️ Tier 3: Execution (Logic & Tools)
*Componenti: `src/graph/factory.py`, `src/services/media_processor.py`*

Il luogo dove avviene il lavoro pesante (Muscle Layer).
- **Agent Graph Factory**: Costruisce grafi LangGraph isolati per ogni richiesta.
- **Media Processor**: Gestisce I/O pesanti come l'upload di video e analisi vision asincrone.

---

## 🛠️ Tool Registry & Vision

| Modulo | Percorso File | Responsabilità |
| :--- | :--- | :--- |
| **Tool Registry** | `src/graph/tools_registry.py` | Definizione di tutti gli strumenti (Render, Triage, Mercato). |
| **Vision Engine** | `src/vision/triage.py` | Analisi "Agentic Vision" per identificare stanze e potenziali di ristrutturazione. |
| **Generation** | `src/tools/imagen_tools.py` | Integrazione con Imagen 3 per rendering fotorealistici. |
| **Market Intel** | `src/tools/perplexity_intel.py`| Ricerca prezzi materiali via Sonar (Perplexity). |

---

## 🗄️ Livello Data & Persistenza (`src/repositories/`)

Il backend utilizza un pattern Repository per isolare la logica del database.

| Modulo | Percorso File | Responsabilità |
| :--- | :--- | :--- |
| **Conversation Repo** | `src/repositories/conversation_repository.py` | Gestione sessioni, messaggi e stato conversazione. |
| **Quota Manager**| `src/tools/quota.py` | Tracciamento utilizzo giornaliero strumenti premium. |
| **Project DAO** | `src/db/projects.py` | Gestione metadati cantieri e galleria immagini. |

---

## 🛡️ Affidabilità & Osservabilità (Enterprise Ready)

Il sistema è stato hardenizzato per la produzione con le seguenti caratteristiche:

- **Request Tracing**: Middleware `main.py` inietta un `X-Request-ID` unico in ogni richiesta, propagato tramite `contextvars` in tutti i log.
- **Structured Logging**: `src/core/logger.py` emette log in formato **JSON** per facilitare l'audit e l'osservabilità in Cloud Logging.
- **Standardized Error Handling**: Gerarchia di eccezioni `AppException` con schema di risposta `APIErrorResponse` (elimina gli errori HTML 500).
- **Async Safety**: `SafeTaskManager` previene la cancellazione di task in background; `run_blocking` evita il blocco dell'event loop per operazioni sincrone.

---

## ⚡ Ottimizzazioni
- **Gatekeeper**: (`agent.py` → `entry_gatekeeper`) Bypassa il reasoning per saluti e frasi semplici per ridurre latenza.
- **Lazy Loading**: Il grafo dell'agente e i modelli LLM vengono inizializzati solo al primo pacchetto per accelerare il boot.

