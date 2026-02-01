# 🏗️ SYD Bioedilizia - AI Renovation Platform

> **SYD** è una piattaforma SaaS d'avanguardia per la ristrutturazione edilizia, che combina Intelligenza Artificiale generativa, analisi di mercato in tempo reale e gestione progetti persistente.

---

## 🏛️ Architettura Operativa (3-Tier CoT)

La piattaforma adotta un modello **Python-First Chain of Thought (CoT)** per garantire controllo deterministico e performance elevate:

1.  **Tier 1: Directive (Reasoning)**: Il "Pre-Cortex" (Gemini 2.0 Flash) analizza l'intento e genera un piano strutturato. Validato da guardrail **Pydantic** per prevenire allucinazioni.
2.  **Tier 2: Orchestration (Routing)**: Logic layer in Python (`edges.py`) che smista il flusso di lavoro basandosi sul piano validato.
3.  **Tier 3: Execution (Muscle)**: Un **SOP Manager** dinamico applica regole di business e accessi privilegiati (RBTA) prima di eseguire strumenti o generare risposte finali.


---

## 📋 Tech Stack

### Frontend (`web_client`)
- **Framework**: Next.js 15.5.11 (App Router)
- **Library**: React 18.3.1
- **Styling**: Tailwind CSS 4.0 (Design Premium / Glassmorphism)
- **Motion**: Framer Motion (Liquid UI)
- **Auth**: Firebase Auth (Biometrics & Magic Links)
- **Data Fetching**: Server Actions & SWR/React Hooks

### Backend (`backend_python`)
- **API**: FastAPI (Asincrono)
- **AI Engine**: Google Vertex AI (Gemini 1.5 Pro/Flash, Imagen 3)
- **Orchestration**: LangGraph (Agentic Workflows)
- **Vision**: Custom Image Processing (Pillow, Vision API)
- **Market Intel**: Perplexity AI (Sonar)
- **Database**: Firestore (NoSQL)

---

## ✨ Funzionalità Core

### 1. Chat Assistant Intelligente
Un assistente che "vede" e "capisce" gli spazi. Capace di:
- Analizzare foto/video caricati per estrarre metrature e stato di fatto.
- Generare rendering fotorealistici basati su stili specifici.
- Formulare preventivi dettagliati basati su prezzi di mercato reali.

### 2. Dashboard Project Management
Trasformazione da semplice chatbot a strumento professionale:
- **I Miei Progetti**: Gestione persistente di più cantieri.
- **Galleria Intelligente**: Organizzazione automatica di rendering, preventivi e foto originali.
- **Dettagli Cantiere**: Salvataggio di vincoli tecnici (metratura, budget, note) per un'AI sempre più precisa.

### 3. Sicurezza di Grado Enterprise
- **Passwordless**: Accesso sicuro tramite dati biometrici (Passkeys).
- **App Check**: Protezione contro bot e accessi non autorizzati via Firebase App Check.
- **Strict Typing**: Sincronizzazione rigorosa dei tipi tra Pydantic (Python) e TypeScript.

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
cd web_client && npm run dev

# Backend (localhost:8000)
cd backend_python && uv sync && python -m main
```

---

## 🛠️ Manutenzione e Qualità
- **Linting**: `npm run lint` (Frontend)
- **Testing**: `pytest` (Backend)
- **Type Check**: `npm run type-check` (Frontend)

---

## 🤝 Project Owner
**SYD Bioedilizia** - *Trasformiamo la tua visione in realtà con l'AI.*

---
*Copyright © 2026 SYD Bioedilizia. All rights reserved.*
