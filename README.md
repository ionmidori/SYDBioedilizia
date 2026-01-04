# 🏗️ Renovation AI - Assistente per Interior Design

> Chatbot basato su IA per la visualizzazione di interni e preventivi di ristrutturazione, costruito con Next.js 16 e Google Gemini AI.

---

## 📋 Tech Stack

### Frontend (`web_client`)
- **Framework**: Next.js 16.0.10 (App Router) + React 19
- **Stile**: Tailwind CSS 4.0
- **Integrazione IA**: Vercel AI SDK 6.0 + @ai-sdk/google
- **Animazioni**: Framer Motion
- **Componenti UI**: Radix UI
- **Testing**: Jest + React Testing Library

### Logica Backend (`ai_core`)
- **Modelli IA**: Google Gemini Pro + Imagen 3 (via Vertex AI)
- **Database**: Firebase Firestore + Firebase Admin SDK
- **Validazione**: Zod 4.3
- **Elaborazione Immagini**: Sharp
- **Linguaggio**: TypeScript 5

### Infrastruttura
- **Monorepo**: npm workspaces
- **Database**: Firebase Firestore (NoSQL)
- **Storage**: Firebase Cloud Storage
- **Analytics**: Vercel Analytics + Speed Insights

---

## 🏛️ Panoramica Architettura

Si tratta di un **monorepo modulare** con una rigorosa separazione delle responsabilità:

```
renovation-next/
├── web_client/          # Frontend Next.js (UI Layer)
│   ├── app/            # Pagine App Router & API routes
│   ├── components/     # Componenti React
│   └── hooks/          # Custom React hooks
│
├── ai_core/            # Business logic (Service Layer)
│   └── src/
│       ├── chat-tools.ts       # Tool per le chiamate a funzione IA
│       ├── db/                 # Adapter per Firestore
│       └── imagen/             # Logica di generazione immagini
│
└── package.json        # Root del Workspace
```

**Principio Chiave**: `web_client` importa da `@ai-core` (mai il contrario). Questo garantisce che la logica IA sia portabile e testabile indipendentemente.

---

## 🚀 Per Iniziare

### Prerequisiti

- **Node.js**: >= 18.x
- **npm**: >= 9.x (o pnpm/yarn)
- **Progetto Firebase**: Progetto attivo con Firestore e Storage abilitati
- **Google Cloud**: API Vertex AI abilitata con credenziali service account

### 1. Clona e Installa

```bash
# Clona il repository
git clone <tuo-repo-url>
cd renovation-next

# Installa tutte le dipendenze (root + workspaces)
npm install
```

### 2. Configurazione Ambiente

Crea un file `.env` nella directory **`web_client/`** con le seguenti variabili:

```bash
# Configurazione Firebase
FIREBASE_PROJECT_ID=tuo-project-id
FIREBASE_CLIENT_EMAIL=tua-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google AI
GEMINI_API_KEY=tua-gemini-api-key

# Modelli Imagen (opzionale - default forniti)
IMAGEN_I2I_MODEL=imagegeneration@006
IMAGEN_CAPABILITY_MODEL=imagen-3.0-capability-001
```

> **Nota di Sicurezza**: Mai committare i file `.env`. Il `.gitignore` è configurato per escluderli.

### 3. Configurazione Firebase

Se non l'hai già fatto, scarica il file JSON della service account Firebase:

1. Vai su Console Firebase → Impostazioni Progetto → Account di servizio
2. Clicca "Genera nuova chiave privata"
3. Salva come `firebase-service-account.json` nella root del progetto (ignorato da git)

### 4. Avvia il Server di Sviluppo

```bash
# Avvia il server Next.js (con Turbopack)
npm run dev:web

# L'app sarà disponibile su http://localhost:3000
```

Il modulo `ai_core` viene compilato e monitorato automaticamente da Next.js quando importato.

---

## 🧪 Testing

### Esegui i Test

```bash
# Esegui tutti i test una volta
npm run test --workspace=web_client

# Esegui i test in modalità watch (consigliato per lo sviluppo)
npm run test:watch --workspace=web_client

# Genera report di coverage
npm run test:coverage --workspace=web_client
```

### Type Checking

```bash
# Controlla i tipi TypeScript per web_client
cd web_client && npx tsc --noEmit

# Controlla i tipi TypeScript per ai_core
cd ai_core && npx tsc --noEmit
```

---

## 📦 Build & Deploy

### Build di Produzione

```bash
# Compila l'app Next.js per la produzione
npm run build --workspace=web_client

# Avvia il server di produzione
npm run start --workspace=web_client
```

### Deploy su Vercel

```bash
# Installa Vercel CLI
npm i -g vercel

# Deploy (dalla directory web_client)
cd web_client && vercel --prod
```

> **Importante**: Imposta tutte le variabili d'ambiente nelle impostazioni del progetto su Vercel.

---

## 🔐 Funzionalità di Sicurezza

- **Rate Limiting**: Ibrido (Firestore + In-Memory) su tutte le API routes
- **Validazione Input**: Schemi Zod per tutti i parametri dei tool IA
- **Header CSP**: Content Security Policy rigorosa configurata
- **Regole Firestore**: Accesso server-only alle collezioni sensibili (leads, sessions)
- **HSTS**: HTTP Strict Transport Security abilitato

---

## 🛠️ Suggerimenti di Sviluppo

### Comandi Workspace

```bash
# Esegui comando in uno specifico workspace
npm run <script> --workspace=web_client
npm run <script> --workspace=ai_core

# Installa dipendenza in uno specifico workspace
npm install <package> --workspace=web_client
```

### Hot Reload

Le modifiche a `ai_core` vengono rilevate automaticamente dal server dev di Next.js grazie alla configurazione `transpilePackages`. Non è necessario riavviare.

### Debugging

- **Log Server**: Controlla l'output del terminale per le chiamate API
- **Log Client**: Apri la Console dei DevTools del browser
- **Risposte IA**: Controlla i log della console in `api/chat/route.ts`

---

## 📚 Struttura del Progetto

```
web_client/
├── app/
│   ├── api/chat/route.ts          # Endpoint principale chat IA
│   ├── api/upload-image/route.ts  # Gestore upload immagini
│   └── page.tsx                   # Landing page
├── components/
│   └── chat/                      # Componenti UI Chat
├── lib/
│   ├── firebase-admin.ts          # Singleton Firebase Admin
│   └── rate-limit.ts              # Logica rate limiting
└── hooks/
    └── useChat.ts                 # Hook chat personalizzato

ai_core/
└── src/
    ├── index.ts                    # API pubblica (barrel file)
    ├── chat-tools.ts               # Tool Gemini function calling
    ├── db/
    │   ├── leads.ts                # Gestione Leads
    │   ├── messages.ts             # Cronologia chat
    │   └── schema.ts               # Tipi Firestore
    └── imagen/
        ├── generate-interior.ts    # Text-to-image
        └── generate-interior-i2i.ts # Image-to-image editing
```

---

## 🤝 Contribuire

1. Crea un branch per la feature (`git checkout -b feature/nuova-funzionalita`)
2. Apporta le modifiche e testa accuratamente
3. Assicurati che i test passino (`npm run test --workspace=web_client`)
4. Committa le modifiche (`git commit -m 'Aggiunta nuova funzionalità'`)
5. Pusha sul branch (`git push origin feature/nuova-funzionalita`)
6. Apri una Pull Request

---

## 📄 Licenza

Questo progetto è privato e proprietario.

---

## 🆘 Risoluzione Problemi

### `Module not found: @ai-core`
- Assicurati di aver eseguito `npm install` nella directory root
- Controlla che `web_client/tsconfig.json` abbia l'alias path `@ai-core`

### Errori TypeScript nei file di test
- Esegui `npx tsc --noEmit` per verificare se gli errori sono nel codice dell'app o nella configurazione di test
- Riavvia il server TypeScript in VS Code (`Ctrl+Shift+P` → "TypeScript: Restart TS Server")

### Errori permessi Firebase
- Verifica che la service account abbia i ruoli IAM corretti (Firestore Admin, Storage Admin)
- Controlla che la variabile d'ambiente `FIREBASE_PRIVATE_KEY` includa `\n` per le interruzioni di riga

---

**Realizzato con ❤️ dal Team Renovation AI**
