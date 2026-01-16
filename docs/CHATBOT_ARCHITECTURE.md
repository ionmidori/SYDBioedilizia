# 🗺️ Mappa dell'Architettura del Chatbot

Questo documento delinea la struttura dei file e le funzioni principali del Chatbot Renovation AI, mappando la logica ai file specifici nel monorepo.

## 🟢 Livello Frontend (`web_client`)

Gestisce l'interfaccia utente, la gestione dello stato e lo streaming in tempo reale.

| Componente | Percorso File | Funzionalità |
| :--- | :--- | :--- |
| **Pagina Chat** | `app/page.tsx` | Entry point principale, wrapper del layout. |
| **Widget Chat** | `components/chat/ChatWidget.tsx` | Contenitore UI principale. Orchestra `ChatMessages` e `ChatInput`. |
| **Lista Messaggi** | `components/chat/ChatMessages.tsx` | Renderizza i messaggi, il testo Markdown e le **Immagini**. |
| **Hook Logica** | `hooks/useChat.ts` | **Logica Client Core**. Gestisce: <br>• Connessione WebSocket/Stream <br>• Parsing messaggi (Data Stream Protocol) <br>• Stato (caricamento, errori, UI ottimistica) |
| **Client API** | `app/api/chat/route.ts` | **Orchestratore Server-Side**. <br>• Valida Utente/Sessione <br>• Applica Rate Limits <br>• Chiama Gemini Pro (via `streamText`) <br>• Persistenza (salva messaggi su Firestore) |

---

## 🔵 Livello Intelligence (`ai_core`)

Contiene il "Cervello" del chatbot: tool IA, prompt engineering e logica di business.

### 🛠️ Tool IA (Function Calling)

Situati in: `ai_core/src/chat-tools.ts`

| Nome Tool | Descrizione | File Logica |
| :--- | :--- | :--- |
| **generate_render** | Crea/Modifica design d'interni. | Orchestrato in `chat-tools.ts` <br>→ Chiama `imagen/generator.ts` |
| **get_market_prices** | Ricerca prezzi in tempo reale (Perplexity). | Logica inline in `chat-tools.ts` |
| **submit_lead_data** | Salva info contatto cliente. | Logica inline -> chiama `db/leads.ts` |

### 🎨 Pipeline Generazione Immagini (`ai_core/src/imagen/`)

| Modulo | File | Responsabilità |
| :--- | :--- | :--- |
| **Generator** | `generator.ts` | Facade principale. Decide la strategia (T2I vs I2I). |
| **Client** | `imagen_client.ts` | Wrapper basso livello per API Google Vertex AI / Imagen 3. |
| **Prompt Builder** | `prompt-builders.ts` | Converte l'intento utente in prompt ingegnerizzati ottimizzati. |
| **Upload Utility**| `upload-base64-image.ts`| Carica le immagini generate su Firebase Storage. |

### 👁️ Visione & Analisi (`ai_core/src/vision/`)

| Modulo | File | Responsabilità |
| :--- | :--- | :--- |
| **Triage** | `triage.ts` | Analisi rapida foto caricate (Tipo Stanza, Stile). |
| **Architect** | `architect.ts` | Analisi strutturale avanzata (Geometria, Finestre, Travi) per ricostruzione. |

---

## 🟠 Livello Data (`ai_core/src/db/`)

Gestisce la persistenza usando Firebase Firestore.

| Entità | File | Collezione |
| :--- | :--- | :--- |
| **Messaggi** | `messages.ts` | `sessions/{id}/messages` |
| **Leads** | `leads.ts` | `leads` |
| **Preventivi (Quotes)** | `quotes.ts` | `quotes` (Bozze collegate alle sessioni) |

---

## 🔐 Configurazione & Sicurezza

| Tipo | File | Dettagli |
| :--- | :--- | :--- |
| **Var Amb** | `web_client/.env` | API Keys (Gemini, Perplexity, Firebase). |
| **Rate Limit** | `web_client/lib/rate-limit.ts` | Logica throttling basata su IP. |
| **Tool Quota** | `ai_core/src/tool-quota.ts` | Logica per limitare tool costosi specifici (Render/Preventivi). |
