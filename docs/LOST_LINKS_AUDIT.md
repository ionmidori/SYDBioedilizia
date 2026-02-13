# 📉 Analisi Legami Persi / Disallineati (Post-Refactoring)
## Backend (Python) ↔️ Frontend (Next.js)

Questo audit identifica le discrepanze, i protocolli obsoleti e le violazioni dei confini architettonici (Tier-2 vs Tier-3) nate a seguito della migrazione del backend in Python.

---

## 1. Disconnessione delle Rotte API (Major)
Il frontend sta ancora puntando a "Shadow API" locali invece di utilizzare il Backend Python come Source of Truth.

| Funzionalità | Endpoint Chiamato dal Frontend | Hook Responsabile | Endpoint Reale (Python) | Stato |
| :--- | :--- | :--- | :--- | :--- |
| **Lead Generation** | `/api/lead-magnet` | `LeadCaptureForm.tsx` | `/api/submit-lead` | ❌ **SCOLLEGATO** |
| **Upload Immagini** | `/api/upload-image` | `useImageUpload.ts` | `/api/upload` | ❌ **SCOLLEGATO** |
| **Upload Video** | `/api/get-upload-url` | `useVideoUpload.ts` | `/api/upload/video` | ❌ **SCOLLEGATO** |
| **Chat Stream** | `/api/chat` (Proxy Node) | `ChatWidget.tsx` | `/chat/stream` | ⚠️ **RIDONDANTE** |

> [!WARNING]
> La rotta `/api/chat/route.ts` agisce come proxy Node.js verso Python. Sebbene funzionante, è ridondante poiché esiste già un `rewrite` in `next.config.ts`. Questo aggiunge latenza e consumo di risorse Next.js non necessari.

---

## 2. Deriva dei Modelli Dati (Golden Sync)

### A. Lead Management (`LeadData`)
- **Backend (`lead.py`):** Richiede `project_details`.
- **Frontend (`LeadCaptureForm.tsx`):** Invia `quote_summary`.
- **Impatto:** Mismatch dei nomi dei campi che costringe a mapping manuali nel `main.py` (linea 161).

### B. Ragionamento AI (`ReasoningStep`)
- **Backend (`reasoning.py`):** Produce un oggetto strutturato con `analysis`, `confidence_score`, `protocol_status`.
- **Frontend (`chat.ts`):** Il tipo `Message` supporta solo una stringa per la parte `reasoning`. 
- **Link Perso:** I metadati di confidenza e lo stato del protocollo vengono scartati durante il transito verso la UI.

### C. Gestione Progetti (`ProjectDocument`)
- **Backend:** Utilizza oggetti `datetime` nativi di Pydantic.
- **Frontend:** Gestisce i timestamp come stringhe ISO in `projects.ts`.

---

## 3. Violazione della Legge dei 3 Livelli (Tier-2 vs Tier-3)

### 🛑 Accesso Diretto al Database (Tier-2 Shadow)
Il hook `useChatHistory.ts` utilizza direttamente l'SDK Web di Firebase (`onSnapshot`) per sottoscriversi a `sessions/{sessionId}/messages`. 
- **Problema:** Questo bypassa il Backend Python, rendendo impossibile applicare validazioni, auditing o filtri lato server (es. oscuramento PII).

### 🛑 Logica in Node.js (Legacy-API)
Il file [legacy-api.ts](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/web_client/lib/legacy-api.ts) contiene logica di gestione buffer e Signed URL.
- **Rischio:** Duplicazione della logica di sicurezza e gestione dei segreti in due ambienti diversi.

---

## 4. Protocollo di Chat (Fragilità)

- **Input Strutturato:** Il backend `ChatRequest` supporta `video_file_uris` e `media_metadata`.
- **Stato Frontend:** Il protocollo di invio non popola ancora questi campi, rendendo inaccessibili le nuove funzionalità del backend (es. video trimming).

---

## 🚀 Stato della Remediation

| Milestone | Descrizione | Riferimento | Stato |
| :--- | :--- | :--- | :--- |
| **Piano Tecnico** | Strategia Tier-2/3 approvata | [TECHNICAL_REMEDIATION_PLAN.md](file:///c:/Users/User01/.gemini/antigravity/brain/5e8d4ea5-bf6e-4f11-9bd5-920aa3c43465/TECHNICAL_REMEDIATION_PLAN.md) | ✅ Completato |
| **Golden Sync** | Sincronizzazione Tipi Lead/Reasoning | `web_client/types/*` | ⏳ In Coda |
| **Eliminazione Shadow** | Migrazione API verso Python | `web_client/lib/api-client.ts` | ⏳ In Coda |
| **Firestore Transition** | Spostamento `useChatHistory` su API Python | `hooks/useChatHistory.ts` | ⏳ In Coda |

---

> [!IMPORTANT]
> Tutte le rotte in `web_client/app/api/` (eccetto quelle di sistema Next.js) devono essere rimosse nel prossimo sprint.
