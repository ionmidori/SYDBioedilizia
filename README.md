# 🏗️ SYD Bioedilizia - AI Renovation Platform

> **SYD** è una piattaforma SaaS d'avanguardia per la ristrutturazione edilizia, che combina Intelligenza Artificiale generativa, analisi di mercato in tempo reale e gestione progetti persistente.

---

## 🏛️ Architettura Operativa (Enterprise 3-Tier)

La piattaforma adotta un'architettura **Service-Oriented** strutturata su tre livelli per massimizzare scalabilità e manutenibilità:

1.  **Tier 1: Directives (Strategy)**: Gestito da `IntentClassifier` e `ReasoningNode` (Gemini 2.5 Flash). Analizza l'intento dell'utente e seleziona la SOP (Standard Operating Procedure) più adatta, pianificando le azioni in modo strutturato.
2.  **Tier 2: Orchestration (Service Layer)**: `AgentOrchestrator` coordina il flusso di lavoro. Gestisce lo streaming tipizzato (Vercel Protocol), la persistenza dei dati tramite pattern **Repository** e la sincronizzazione in tempo reale con Firestore.
3.  **Tier 3: Execution (Muscle)**: `AgentGraphFactory` e `Tools`. Esecuzione di grafi LangGraph isolati, analisi Vision asincrona e generazione di asset fotorealistici (Imagen 3).


---

## 📋 Tech Stack

### Frontend (`web_client`)
- **Framework**: Next.js 15.1 (App Router)
- **Library**: React 18.3
- **Styling**: Tailwind CSS 4.0 (Design Premium / Glassmorphism)
- **Motion**: Framer Motion (Material 3 Expressive / Soft)
- **Auth**: Firebase Auth (Biometrics & RSA Verification)
- **Data Fetching**: Vercel AI SDK & Realtime Firestore Sync

### Backend (`backend_python`)
- **API**: FastAPI (Asincrono / Enterprise Hardened)
- **AI Engine**: Google Vertex AI (**Gemini 2.5 Flash**, Imagen 3)
- **Orchestration**: LangGraph (Agentic Workflows)
- **Vision**: Custom Image/Video Processing (Gemini File API)
- **Database**: Firestore (NoSQL)
- **Logging**: Structlog (Structured JSON Logging)

---

## ✨ Funzionalità Core

### 1. Chat Assistant Proattivo (Guided Flows)
Non un semplice chatbot, ma un consulente che guida l'utente:
- **Intelligent State Tracking**: Monitora il progresso tramite flag (`is_quote_completed`, `is_render_completed`).
- **Cross-Selling Automatico**: Propone rendering dopo un preventivo e viceversa per massimizzare la conversione.
- **Vision AI Optimization**: Analisi di foto/video grandangolari (0.5x) per precisione millimetrica.

### 2. Lead Capture & Security UI
- **UI-First PII**: Raccolta dati sicura tramite widget visuali (`LeadCaptureForm`) invece di semplici messaggi di testo.
- **Enterprise Security**: Protezione globale tramite Firebase App Check e tracciamento `X-Request-ID`.
- **Material 3 Expressive**: Interfaccia "Soft" con feedback tattile, animazioni a molla e design premium.

### 3. Dashboard Project Management
- **I Miei Progetti**: Gestione persistente di più cantieri con sincronizzazione zero-latency.
- **Galleria Intelligente**: Organizzazione automatica di rendering, preventivi e foto originali.

---

## 🚀 Setup & Sviluppo

### Installazione
Il progetto utilizza npm workspaces. Dalla root:

```bash
npm install
```

### Configurazione
È necessario configurare i file `.env` sia in `web_client/` che in `backend_python/` (vedi i rispettivi file `.env.example`).

### Avvio Sviluppo
```bash
# Frontend (localhost:3000)
npm run dev:web

# Backend (localhost:8080)
cd backend_python && uv sync && uv run uvicorn main:app --reload --port 8080
```

---

## 🛠️ Manutenzione e Qualità
- **Linting**: `npm run lint` (Frontend)
- **Testing**: `uv run pytest` (Backend)
- **Type Check**: `npm run type-check` (Frontend)

---

## 🤝 Project Owner
**SYD Bioedilizia** - *Trasformiamo la tua visione in realtà con l'AI.*

---
*Copyright © 2026 SYD Bioedilizia. All rights reserved.*
