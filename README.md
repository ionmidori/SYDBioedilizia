# 🏗️ Renovation AI - Assistente per Interior Design

> Chatbot evoluto basato su IA per la visualizzazione di interni, preventivi di ristrutturazione e analisi di mercato in tempo reale. Costruito con Next.js 16, Google Vertex AI e Perplexity.

---

## 📋 Tech Stack

### Frontend (`web_client`)
- **Framework**: Next.js 16.0.10 (App Router) + React 19
- **Stile**: Tailwind CSS 4.0
- **IA Streaming**: Vercel AI SDK 3.0 + @ai-sdk/google
- **UI/UX**: Radix UI + Framer Motion
- **State**: Custom Hooks (`useChat` con protocollo Data Stream)

### Backend & AI Logic (`ai_core`)
- **Core AI**: Google Gemini Pro (Logica conversazionale & Vision)
- **Image Gen**: Google Imagen 3 (via Vertex AI `gemini-3-pro-image-preview`)
- **Market Intel**: Perplexity API (`sonar`) per prezzi in tempo reale
- **Database**: Firebase Firestore (NoSQL)
- **Storage**: Firebase Cloud Storage
- **Validazione**: Zod 4.3

---

## ✨ Funzionalità Chiave

### 1. Generazione Ibrida (JIT Pipeline)
Il sistema utilizza una pipeline **Just-In-Time** che decide dinamicamente la strategia di generazione:
- **Creation Mode (Text-to-Image)**: Genera nuovi ambienti da zero basandosi sulle descrizioni dell'utente.
- **Renovation Mode (Image-to-Image)**: Ridisegna stanze esistenti mantenendo la geometria strutturale (muri, finestre, soffitti).
  - **Structural Lock**: Analizza e preserva le linee prospettiche.
  - **Selective Keep**: Permette all'utente di specificare elementi da mantenere (es. "tieni il pavimento in cotto").

### 2. Analisi Prezzi di Mercato
Integrazione con **Perplexity AI** per fornire stime di costo realistiche e localizzate:
- Ricerca in tempo reale su e-commerce italiani e listini fornitori.
- Output strutturato con range di prezzo (Min-Max) e unità di misura.

### 3. Sistema di Quote e Sicurezza
- **IP-Based Rate Limiting**: Limita le generazioni pesanti (Render e Preventivi) a 2 per IP ogni 24 ore.
- **Validazione Input**: Tutti gli input utente vengono validati e sanitizzati tramite schemi Zod prima di raggiungere i modelli IA.
- **CSP & HSTS**: Security headers rigorosi per la protezione client-side.

---

## 🏛️ Panoramica Architettura

Monorepo gestito tramite npm workspaces con separazione netta delle responsabilità:

```
renovation-next/
├── web_client/          # UI Layer (Next.js)
│   ├── app/            # Routes & Pages
│   ├── components/     # Chat Widget & Markdown renderers
│   └── hooks/          # Logica client-side
│
├── ai_core/            # Intelligence Layer (Service)
│   └── src/
│       ├── chat-tools.ts       # Definizioni Tool (Render, Market, Leads)
│       ├── imagen/             # Pipeline Generativa (Triage -> Architect -> Painter)
│       ├── vision/             # Analisi Visiva & Estrazione Strutturale
│       └── db/                 # Firestore Adapters
│
└── package.json        # Workspace Root
```

**Flusso Dati**: `web_client` invoca le funzioni di `ai_core` server-side (Server Actions o API Routes), mantenendo la logica di business isolata dalla UI.

---

## 🚀 Per Iniziare

### Prerequisiti
- **Node.js**: >= 18.x
- **npm**: >= 9.x
- **Account Firebase**: Firestore + Storage + Auth
- **Google Cloud**: Vertex AI API abilitata
- **Perplexity**: API Key attiva

### 1. Installazione

```bash
git clone <repo-url>
cd renovation-next
npm install
```

### 2. Configurazione (`web_client/.env`)

Crea il file `.env` nella directory `web_client/`:

```bash
# Firebase
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_STORAGE_BUCKET=...

# Google AI (Vertex)
GEMINI_API_KEY=...

# Market Intelligence
PERPLEXITY_API_KEY=pplx-...

# Opzionali (Model override)
IMAGEN_MODEL_ID=gemini-3-pro-image-preview
```

### 3. Avvio Sviluppo

```bash
# Avvia tutto il sistema
npm run dev:web
```
L'applicazione sarà accessibile su `http://localhost:3000`.

---

## 🧪 Testing & Verifica

Il progetto include suite di test complete per garantire la stabilità della pipeline IA:

```bash
# Test Unitari Frontend
npm run test --workspace=web_client

# Test Pipeline IA (Core)
# Verifica la generazione, le quote e l'integrazione DB
npm run test --workspace=ai_core
```

Sono presenti script specifici in `ai_core` per testare isolatamente i modelli (es. `test-imagen.ts`, `test-rate-limit.ts`).

---

## 🤝 Contribuire

1.  **Branching**: Usa feature branches (`feature/nome-feature`).
2.  **Linting**: Assicurati che non ci siano errori di lint (`npm run lint`).
3.  **Testing**: Verifica che le modifiche non rompano la pipeline esistente.

---

## 📄 Licenza

Proprietario e Riservato. Copyright © 2026 Renovation AI Team.
