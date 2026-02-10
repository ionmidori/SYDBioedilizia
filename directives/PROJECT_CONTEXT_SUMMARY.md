# Project Context & Session Memory (Update: 2026-02-10)

Questo file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti in questa sessione e mantenere la continuità architetturale.

## 🏢 Chain of Thought (CoT) & Frontend Integration (2026-02-10)

Abbiamo completato l'integrazione del ragionamento strutturato ("Thinking") tra backend e frontend, migliorando trasparenza e sicurezza.

### 1. Protocollo di Ragionamento (Backend)
- **`stream_protocol.py`**: Aggiunta funzione `stream_reasoning` per inviare step di pensiero via SSE.
- **PII Redaction**: Implementata protezione contro il leak di dati sensibili (email, telefoni) nei tool argomenti (es. `submit_lead`) prima dello streaming al client.
- **LangGraph Implementation**: Il `reasoning_node` ora utilizza **Gemini 2.5 Flash** per generare piani d'azione strutturati (`ReasoningStep`).

### 2. Sincronizzazione Frontend & UI (Critical Fix)
- **ThinkingIndicator**: Creato componente UI dorato che visualizza il processo di pensiero dell'AI in tempo reale, includendo Confidence Score e Intent Classification.
- **Expo Data Stream**: Il `ChatProvider` ora espone il flusso `data` grezzo (Vercel AI SDK) per catturare gli eventi di ragionamento SSE.

  3. Informazioni Generali ℹ️

---

## 🛠️ Bug Critici Risolti (Aggiornamento 2026-02-10)

### 9. Pydantic Validation (500 Error - history)
- **Problema**: `ValidationError` su `MessageResponse` perché Firestore restituiva `attachments` come lista, mentre il modello si aspettava un dizionario.
- **Fix**: Allineato il modello in `src/api/chat_history.py` per accettare `list` in modo robusto.

### 10. Orchestrator Crash (TypeError)
- **Problema**: `TypeError: sequence item 0: expected str instance, list found`.
- **Causa**: L'LLM inviava contenuti complessi (liste di tool call) che l'orchestratore tentava di unire come stringhe semplici.
- **Fix**: Aggiunta logica di flattening e validazione dei tipi in `stream_chat` (`agent_orchestrator.py`).

### 11. Chat Response Loop (Frontend Guard)
- **Problema**: Il frontend inviava messaggi vuoti o solo "..." se l'utente premeva invio freneticamente o se l'AI rispondeva con "...", creando loop infiniti.
- **Fix**: Implementato guard rigoroso in `ChatProvider.tsx` che blocca l'invio di messaggi senza testo significativo (salvo allegati).

### 12. Model Not Found (404 Error)
- **Problema**: Errori 404 costanti su `gemini-2.0-flash-lite-preview-02-05`.
- **Fix**: Consolidato l'uso di **`gemini-2.5-flash`** (configurato correttamente in `.env` e `agent.py`).

---

## 🏢 Remediation Audit & Tier-3 Enforcement (2026-02-06)

Il sistema è stato bonificato per eliminare le "Shadow API" e garantire che il backend Python sia l'unica **Source of Truth**. Tutte le fasi 1-7 sono state completate con successo.

### 1. Eliminazione Totale Shadow APIs (Phase 2 & 4)
Tutte le rotte API Node.js ridondanti sono state **ELIMINATE**:
- `web_client/app/api/lead-magnet/` -> Sostituito da `/api/py/submit-lead` (Python).
- `web_client/app/api/upload-image/` -> Sostituito da `/api/py/upload/image` (Python).
- `web_client/app/api/chat/history/` -> Sostituito da `/api/py/sessions/{id}/messages` (Python).

### 2. Golden Sync & Firestore Migration
- **Leads:** Allineata l'interfaccia `LeadData` (.ts) con il modello Pydantic (`backend_python`).
- **useChatHistory (SWR Migration):** Rimosso l'accesso diretto a Firestore via SDK (`onSnapshot`). Il frontend ora usa **SWR** per il data fetching tramite l'API Python. (Update 2026-02-10: Sostituito con `onSnapshot` nel hook per realtime ma mediato da `api-client`).

---

## 🏗️ Architettura & Percorsi (Source of Truth)

| Tipo di Dato | Percorso Firestore | Percorso Storage |
| :--- | :--- | :--- |
| **Sessione (Backend)** | `sessions/{id}` | `user-uploads/{id}/` |
| **Progetto (Frontend)** | `projects/{id}` | `projects/{id}/uploads/` |
| **Messaggi Chat** | `sessions/{id}/messages` | - |

**MANDATORY STARTUP:** Il backend Python deve essere avviato da `backend_python/main.py`.

---

## 📋 Regole Operative per l'IA (Elephant Memory)
1. **Model Version**: Usa SEMPRE `gemini-2.5-flash` per compiti di ragionamento ed esecuzione.
2. **CoT Visibility**: Se il backend invia eventi SSE `thinking`, il frontend DEVE mostrarli tramite `data` stream.
3. **Empty Guard**: MAI inviare stringhe vuote o "..." al backend per prevenire loop di costi LLM.
4. **Auth Bypass (Dev)**: In ambiente di sviluppo (`settings.ENV != "production"`), l'autenticazione può essere bypassata usando l'utente `debug-user` se l'header Authorization è mancante.
5. **PII Safety**: Tutte le informazioni di contatto negli argomenti dei tool devono essere oscurate nei log e nello stream pubblico.

---

## 🚀 Documentazione Recente (Nuovi)
- `backend_python/docs/chain_of_thought_analysis.md`: Analisi profonda dell'architettura CoT e meccanismi di governo.
- `brain/4d29e839-2f91-4f23-9f16-febf612e409d/walkthrough.md`: Guida alla verifica completa delle fix e integrazioni della sessione corrente.
