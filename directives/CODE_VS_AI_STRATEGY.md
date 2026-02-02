# Strategia di Riduzione Dipendenza AI (Code-First Approach)

L'obiettivo di questo documento è definire i confini tra logica deterministica (Codice) e logica probabilistica (AI), massimizzando l'uso di Python e TypeScript per garantire affidabilità e scalabilità.

## 1. Mappatura delle Responsabilità

| Funzione | Stato Attuale | Evoluzione Proposta (Code-First) |
| :--- | :--- | :--- |
| **Controllo Flusso** | AI (Reasoning Loop) | **State Machine (Python/TS)**: Percorsi guidati per quote e onboarding. |
| **Ricerca Prezzi** | Perplexity (AI Search) | **Local DB + Hybrid Search**: Database interno di prezzi SYD per preventivi certi. |
| **Validazione Dati** | LLM Validation | **Pydantic / Zod**: Regole rigide per MQ, indirizzi e scadenze. |
| **Triage Input** | AI Classification | **Deterministic Router**: Script Python che smista i file in base a MIME e metadati. |
| **Generazione Immagini** | Imagen 3 (AI) | **Imprescindibile (AI)**: Rimane il core creativo. |

## 2. Implementazione della State Machine (Tier 3)

Invece di lasciare che l'AI decida "cosa chiedere dopo", il backend deve esporre un `workflow_engine` che definisce gli stati del progetto:
1. `NEW`: Richiede titolo e tipo intervento.
2. `UPLOAD_PLANS`: Attesa caricamento piantina.
3. `ROOM_ANALYSIS`: Trigger automatico post-upload (Python script).
4. `QUOTE_GENERATION`: Raccolta MQ e materiali tramite form (Frontend).
5. `COMPLETED`: Progetto pronto per rendering creativo.

## 3. Gestione Deterministica dei Prezzi

Creazione di un modulo `src/db/market_data.py` che carichi dati strutturati (JSON/CSV) per i costi standard.
- Se l'articolo è nel DB locale -> Ritorna prezzo certificato (Codice).
- Se l'articolo è esotico -> Chiama Perplexity (AI) come fallback.

## 4. Estrazione Dati via Regex/Parser

Utilizzare **Python Utility Scripts** per processare il testo utente prima che arrivi all'AI:
- Rilevamento automatico di numeri di telefono, email e misure (mq).
- Inserimento diretto nel database senza passare per i "reasoning steps" dell'AI.
