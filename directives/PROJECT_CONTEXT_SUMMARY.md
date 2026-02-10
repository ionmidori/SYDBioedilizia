# Project Context & Session Memory (Update: 2026-02-10)

Questo file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti in questa sessione e mantenere la continuità architetturale.

## 🚀 Novità Sessione Corrente (Phase 5: Guided Flows)

Abbiamo evoluto il chatbot SYD da un assistente reattivo a un consulente proattivo che guida l'utente attraverso flussi strutturati di conversione.

### 1. User Journey & Cross-Selling
Implemented intelligent state tracking to prevent redundant offers and guide users toward project completion.
- **State Flags**: Aggiunti `is_quote_completed` e `is_render_completed` in `AgentState` per tracciare il progresso.
- **Cross-Sell Logic**: 
    - Se l'utente termina un **Preventivo** -> Proposta di **Rendering Gratuito**.
    - Se l'utente termina un **Rendering** -> Proposta di **Preventivo Rapido** per realizzarlo.
- **State Reducer**: Implementato `custom_tools_node` in `factory.py` che intercetta i tool `submit_lead` e `generate_render` per aggiornare atomicamente i flag di viaggio.

### 2. Lead Capture Widget (UI-First PII)
Abbandonata la raccolta dati testuale per una "Scheda Contatto" visuale e sicura.
- **Componente**: `LeadCaptureForm.tsx` (Card elegante con validazione).
- **Integrazione**: L'AI invoca il tool `display_lead_form`, che il frontend intercetta in `MessageItem.tsx` per renderizzare il widget.
- **Protocollo d'Invio**: Il widget invia una stringa strutturata `[LEAD_DATA_SUBMISSION]` che l'AI processa automaticamente chiamando `submit_lead`.

### 3. Input Quality Control (Vision AI Optimization)
- Istruito l'agente a richiedere esplicitamente foto/video **"grandangolari 0.5x"** per massimizzare la precisione dell'analisi degli ambienti.

### 4. Visual & Tactile Polish (Soft Expressive)
Implementata la prima fase di **Material 3 Expressive** (approccio Soft):
- **Stile**: Rounded corners aumentati a `12px` (`0.75rem`) e ombre dinamiche colorate.
- **Micro-interazioni**:
    - `Button`: Feedback tattile a molla (`scale: 0.96`) integrato nel componente core.
    - `ProjectCard`: Effetto "lift" su hover e animazioni di entrata staggered.
    - `MessageItem`: Animazione "pop" snappier per i messaggi chat.
- **Tooling**: Creato `MotionWrapper.tsx` per standardizzare le animazioni fisiche.

---

## 🏢 Chain of Thought (CoT) & Logic Integration

### 1. Protocollo di Ragionamento (Backend)
- **LangGraph Implementation**: Il `reasoning_node` utilizza **Gemini 2.5 Flash** per generare piani strutturati.
- **SSE Streaming**: Step di pensiero inviati via `stream_reasoning`.
- **PII Redaction**: Meccanismo di sicurezza che oscura dati sensibili negli argomenti dei tool (es. email/tel) prima di inviarli al log client.

### 2. Sincronizzazione Frontend & UI
- **ThinkingIndicator**: Componente UI che visualizza Confidence, Intent e passaggi logici.
- **Sync History**: Risolto il bug "Invisible Message" sincronizzando Firestore con lo stato locale di `useChat` tramite il hook `useChatHistory`.
- **Welcome Message**: Syd saluta ora con opzioni azionabili (1. Preventivo, 2. Render, 3. Info).

---

## 🛠️ Bug Critici Risolti

- **Pydantic Validation (500 Error)**: Corretto modello `MessageResponse` in `chat_history.py` per gestire correttamente la lista `attachments`.
- **Orchestrator Crash (TypeError)**: Gestione dei contenuti "list" inviati dall'LLM in `agent_orchestrator.py`.
- **Response Loop**: Guard in `ChatProvider.tsx` che blocca messaggi vuoti o solo "..." inviati al backend.
- **Model Standard**: Consolidato l'uso di **`gemini-2.5-flash`** (Rimosso 404 su versioni Preview/Lite).

---

## 🏗️ Architettura & Percorsi (Source of Truth)

| Tipo di Dato | Percorso Firestore | Percorso Storage |
| :--- | :--- | :--- |
| **Sessione (Backend)** | `sessions/{id}` | `user-uploads/{id}/` |
| **Progetto (Frontend)** | `projects/{id}` | `projects/{id}/uploads/` |
| **Messaggi Chat** | `sessions/{id}/messages` | - |

---

## 📋 Regole Operative (Elephant Memory)
1. **Model Version**: Usa SEMPRE `gemini-2.5-flash`.
2. **UI Widgets**: Per PII, usa SEMPRE `display_lead_form` invece di chiedere Name/Email in chat.
3. **Empty Guard**: MAI inviare stringhe vuote al backend.
4. **Auth Bypass (Dev)**: Header `Authorization` mancante permette accesso come `debug-user`.

---

## 🚀 Documentazione di Riferimento
- `backend_python/docs/chain_of_thought_analysis.md`
- `brain/4d29e839-2f91-4f23-9f16-febf612e409d/walkthrough.md`
