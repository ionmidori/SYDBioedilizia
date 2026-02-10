# Analisi del Chain of Thought (CoT) in SydBioEdilizia

Questo documento fornisce un'analisi tecnica e logica dell'architettura "Chain of Thought" (CoT) implementata nel progetto `renovation-next`, evidenziando i meccanismi di governo, i recenti bug fix e i punti di intervento.

---

## 1. Architettura Logica e Tecnica

Il "pensiero" dell'agente non è un flusso di coscienza libero, ma un **processo strutturato** governato da tre componenti chiave:

### A. Il Cervello (Reasoning Node)
*   **Locazione**: `src/graph/factory.py` -> `reasoning_node`
*   **Funzione**: È il primo nodo del grafo. Non esegue azioni, *pianifica* soltanto.
*   **Tecnica**: Utilizza un LLM (**Gemini 2.5 Flash**) forzato a produrre un **Structured Output** (`ReasoningStep`). Non può rispondere con testo libero, deve compilare un JSON.

### B. Lo Schema del Pensiero (`ReasoningStep`)
*   **Locazione**: `src/models/reasoning.py`
*   **Struttura**: È una classe Pydantic che definisce rigidamente cosa l'agente può "pensare".
    *   `analysis`: Il ragionamento interno (max 500 caratteri).
    *   `action`: La decisione (`call_tool`, `ask_user`, `terminate`).
    *   `criticism`: Auto-riflessione obbligatoria per cercare errori nel piano.
    *   `intent_category`: Classificazione dell'intento (Info, Action, Clarification).
    *   `risk_score`: Valutazione del rischio (0.0 - 1.0).
    *   `protocol_status`: Il semaforo del flusso (`continue`, `pause`, `complete`).

### C. I Guardrails (Validatori)
*   **Locazione**: `src/models/reasoning.py` (validatori Pydantic)
*   **Funzione**: "Fail-Fast". Se l'LLM allucina un tool non esistente o tenta un'iniezione di codice, il validatore blocca l'esecuzione *prima* che arrivi al grafo.

---

## 2. Punti Logici e Tecnici Determinanti

| Punto Logico | Implementazione Tecnica | Perché è Importante |
| :--- | :--- | :--- |
| **Separazione Pensiero/Azione** | Due nodi distinti nel Grafo LangGraph: `reasoning` vs `execution`. | Impedisce che l'agente "parli mentre agisce". Prima pensa, poi esegue. |
| **Memoria Strutturata** | `state["thought_log"]` conserva la storia dei ragionamenti. | Permette di debuggare *perché* l'agente ha preso una decisione. |
| **Filtro Output** | Regex `re.sub` in `agent_orchestrator.py`. | **Security/UI**: Nasconde i tag `<thought>` all'utente, mostrando solo il risultato pulito. |
| **PII Redaction** | `redact_pii` in `stream_protocol.py`. | **Safety**: Impedisce che dati sensibili (es. email dei lead) finiscano nello stream verso il frontend. |

---

## 4. User Journey & Conversion Logic (Phase 5)

L'architettura è stata estesa per supportare flussi di vendita proattivi e interfacce di cattura dati evolute.

### A. State-Driven Journey Mapping
*   **Locazione**: `src/graph/state.py` e `src/graph/factory.py`
*   **Logica**: Lo stato ora include i flag `is_quote_completed` e `is_render_completed`.
*   **Meccanismo**: Un **custom ToolNode** intercetta le risposte dei tool `submit_lead` e `generate_render` per aggiornare permanentemente il viaggio dell'utente, permettendo all'AI di offrire proattivamente la fase successiva (Cross-Selling).

### B. UI Widget Integration (Direct Data Capture)
*   **Locazione**: `MessageItem.tsx` e `modes.py`
*   **Funzione**: Invece di raccogliere dati via chat (lento e propenso a errori), l'agente invoca `display_lead_form` per mostrare una card UI nativa.
*   **Ciclo di Feedback**: Il frontend risponde con un messaggio speciale `[LEAD_DATA_SUBMISSION]` che viene intercettato dall'agente per eseguire l'azione finale di salvataggio senza ulteriori domande.

---

## 3. Risoluzione Bug e Miglioramenti Recenti

### A. Sincronizzazione Frontend (Invisible Message Bug)
*   **Problema**: La chat appariva vuota perché il `ChatProvider` non era allineato con la storia del database.
*   **Soluzione**: Integrato il hook `useChatHistory` in `ChatProvider.tsx` con una logica di sincronizzazione robusta che popola lo stato dell'SDK AI al cambio di progetto o caricamento sessione.

### B. Cold Start (Messaggio di Benvenuto)
*   **Implementazione**: Quando la storia è vuota, il `ChatProvider` inietta un messaggio di sistema di "Syd" che elenca le funzionalità disponibili (Preventivo, Rendering, Informazioni).

### C. Robustezza Dati (Pydantic & Orchestrator)
*   **Fix Pydantic**: Aggiornata la risposta della cronologia per gestire gli allegati come liste (`list`), prevenendo errori di validazione 500.
*   **Fix Orchestrator**: Gestione robusta dei contenuti di tipo lista nello stream di chat, risolvendo crash quando l'LLM inviava chiamate ai tool in formati inaspettati.

---

## 4. Dove Intervenire (Mappa degli Interventi)

Per governare questo sistema, hai 3 leve principali:

1.  **LIVELLO STRATEGICO (I Prompts)**
    *   *Dove*: `src/prompts/components/*.py` (identity, modes, tools).
    *   *Cosa fare*: Cambiare le "regole del gioco", il tono, o i passaggi obbligati dei protocolli.

2.  **LIVELLO STRUTTURALE (Lo Schema)**
    *   *Dove*: `src/models/reasoning.py`.
    *   *Cosa fare*: Aggiungere nuovi campi obbligatori (es. `estimated_cost`) per forzare il ragionamento su nuovi domini.

3.  **LIVELLO DI FLUSSO (Il Grafo)**
    *   *Dove*: `src/graph/factory.py` e `src/graph/edges.py`.
    *   *Cosa fare*: Implementare logiche di override (es. se `risk_score > 0.8`, forza `ask_user`).

---

### Raccomandazione Finale
Per migliorare la qualità delle risposte, raffinare **`modes.py`** per definire meglio i protocolli operativi e mantenere la **`ReasoningStep`** come guardiana della sicurezza e della coerenza logica.
