# 🗺️ Mappa dell'Architettura del Chatbot (v2.0)

Questo documento delinea la struttura del sistema **SYD Bioedilizia**, mappando la logica ai file specifici dopo la migrazione alla **3-Tier Python-First Architecture**.

## 🟢 1. Livello Orchestrazione Frontend (`web_client`)

Gestisce l'interfaccia utente, lo streaming e la gestione dello stato client.

| Componente | Percorso File | Funzionalità |
| :--- | :--- | :--- |
| **Widget UI** | `components/chat/ChatWidget.tsx` | Contenitore principale. Gestisce caricamento media e interazione. |
| **Logic Hook** | `hooks/useChat.ts` | Gestisce lo stream del Vercel Data Stream Protocol (0:, 9:, a:, 3:). |
| **Proxy Server**| `app/api/chat/route.ts` | Pass-through verso il backend Python. Gestisce Auth & App Check. |

---

## 🐍 2. Livello Intelligence Backend (`backend_python`)

Il "Cervello" del sistema (denominato **SYD Brain**), basato su **LangGraph** e **CoT (Chain of Thought)**.

### 🧠 Tier 1: Directive (Reasoning Node)
*Situato in: `src/graph/agent.py` → `reasoning_node`*
*Logica Pydantic: `src/models/reasoning.py`*

Il sistema pianifica prima di agire. Gemini 2.0 Flash genera un oggetto `ReasoningStep` che viene validato da **Pydantic** per bloccare allucinazioni o tool non autorizzati.

### 📡 Tier 2: Orchestration (Deterministic Routing)
*Situato in: `src/graph/edges.py` → `route_step`*

Il router Python decide il prossimo passo basandosi sul piano validato:
- **`execution`**: Produce la chiamata al tool o la risposta finale.
- **`tools`**: Esegue il tool richiesto.
- **`END`**: Termina la conversazione.

### ⚔️ Tier 3: Execution (SOP & Muscle)
*Situato in: `src/agents/sop_manager.py`*

Gestisce l'accesso agli strumenti basato sui ruoli (**RBTA**):
- **Anonimo**: Solo strumenti base, quota render limitata.
- **Autenticato**: Accesso a preventivi, salvataggio progetti e quota render estesa.

---

## 🛠️ Tool Registry & Vision

| Modulo | Percorso File | Responsabilità |
| :--- | :--- | :--- |
| **Tool Registry** | `src/graph/tools_registry.py` | Definizione di tutti gli strumenti (Render, Triage, Mercato). |
| **Vision Engine** | `src/vision/triage.py` | Analisi "Agentic Vision" per identificare stanze e potenziali di ristrutturazione. |
| **Generation** | `src/tools/imagen_tools.py` | Integrazione con Imagen 3 per rendering fotorealistici. |
| **Market Intel** | `src/tools/perplexity_intel.py`| Ricerca prezzi materiali via Sonar (Perplexity). |

---

## 🗄️ Livello Data & Persistenza (`src/db/`)

Il backend gestisce la memoria a lungo termine su **Firebase Firestore**.

| Modulo | Percorso File | Responsabilità |
| :--- | :--- | :--- |
| **Messages DAO** | `src/db/messages.py` | Salvataggio cronologia, gestione `session_id`. |
| **Quota Manager**| `src/db/quota.py` | Tracciamento utilizzo giornaliero strumenti premium. |
| **Project DAO** | `src/db/projects.py` | Gestione metadati cantieri e galleria immagini. |

---

## ⚡ Ottimizzazioni
- **Gatekeeper**: (`agent.py` → `entry_gatekeeper`) Bypassa il reasoning per saluti e frasi semplici per ridurre latenza.
- **Lazy Loading**: Il grafo dell'agente e i modelli LLM vengono inizializzati solo al primo pacchetto per accelerare il boot.

