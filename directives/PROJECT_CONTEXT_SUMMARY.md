# Project Context & Session Memory (Update: 2026-02-03)

Questo file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti in questa sessione.

## 🛠️ Bug Critici Risolti

### 1. Loop Infinito di Render ("Infinite Loop") - REVISIONE GRAFO
- **Problema:** L'agente rimaneva bloccato in un loop chiamando `generate_render` ripetutamente senza uscire dal nodo `execution`.
- **Soluzione V2 (Agentic Graph):**
    - **Routing Deterministico:** Il nodo `tools` ora torna sempre al nodo `reasoning` (Tier 1) invece di tornare a `execution`. Questo obbliga l'IA a rivalutare lo stato (CoT) dopo ogni azione.
    - **Sincronizzazione Contesto:** Creata funzione `_inject_context` in `agent.py` che garantisce che sia il modulo di ragionamento che quello di esecuzione vedano le stesse istruzioni di sistema e gli stessi link delle immagini caricate.
    - **Circuit Breaker:** Implementato conteggio dei `ToolMessage` negli ultimi 10 messaggi; se > 5, il grafo termina forzatamente (`END`).

### 2. Deletion Silenziosa (Ghost Files)
- **Problema:** Cancellando un progetto, le foto rimanevano nella galleria e i file su Storage non venivano rimossi. (Vedere `delete_project` in `src/db/projects.py` per i dettagli della Deep Deletion).

### 3. Zero-Latency Feedback & Thinking State (Gold Box)
- **Problema:** Il feedback "Thinking..." (Box Dorato) non appariva immediatamente, causando un ritardo percepito di 2+ secondi.
- **Causa Radice:**
    1. **Proxy Next.js:** In Dev, eseguiva `verifyIdToken` (Firebase) su ogni richiesta, aggiungendo 2s di latenza (fetch keys).
    2. **Vercel AI SDK:** Ignora i chunk vuoti (`""`), impedendo la creazione del messaggio "Assistant" finché non arriva il primo token AI.
- **Soluzione Applicata (Definitiva):**
    - **Backend Python:** Il generatore dello stream invia immediatamente `0:"..."\n` (Hack "Three Dots") come primo byte fisico. Abbiamo provato con lo spazio (`" "`) ma veniva filtrato dall'SDK, quindi siamo tornati ai puntini.
    - **Frontend Proxy:** Rimosso completamente il blocco `verifyIdToken` in `route.ts`. L'autenticazione viene gestita dal backend Python *dopo* l'invio del primo chunk.
    - **Frontend UI (`MessageItem.tsx`):**
        - Rileva `message.content.startsWith(...)` per attivare lo stato "Thinking".
        - **Artifact Stripping:** Rimuove visivamente i `...` iniziali dal testo renderizzato per evitare artefatti (es. `...Ciao`).

---

## 🏗️ Progettazione Nuove Funzionalità

### 1. Magic Pencil (Generative Inpainting)
- **Stato:** Studio di fattibilità completato.
- **Approccio Scelto:** Flusso Ibrido a 2 Fasi.
    1. **Fase Interpretativa:** Gemini Vision analizza Immagine + Maschera per identificare l'oggetto target (es. "divano classico").
    2. **Fase Generativa:** Imagen 3 (Vertex AI) esegue l'Inpainting basato sulla descrizione semantica e sul prompt utente.
- **Documentazione:** Vedere [MAGIC_PENCIL_SPEC.md](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/directives/MAGIC_PENCIL_SPEC.md).

---

## 🏗️ Architettura & Percorsi (Source of Truth)

| Tipo di Dato | Percorso Firestore | Percorso Storage |
| :--- | :--- | :--- |
| **Sessione (Backend)** | `sessions/{id}` | `user-uploads/{id}/` |
| **Progetto (Frontend)** | `projects/{id}` | `projects/{id}/uploads/` |
| **Messaggi Chat** | `sessions/{id}/messages` | - |
| **Metadati File** | `projects/{id}/files` | - |

**Nota Tecnica:** Il backend Python deve essere avviato da `backend_python/main.py`. La cartella `src/` è un pacchetto Python (`__init__.py` presente).

---

## 📋 Regole Operative per l'IA
1. **Loop Guard:** Dopo ogni chiamata a un tool, verifica sempre che l'output sia stato sintetizzato per l'utente prima di pianificare un'altra azione.
2. **Context First:** Prima di generare un render, assicurati che la funzione `analyze_room` sia stata eseguita (Triage) per avere i metadati strutturali.
3. **Magic Pencil:** Quando l'utente invia una maschera, attiva il workflow di inpainting descritto nella specifica.

---

## 🚀 Script di Utilità e Documentazione
- `directives/MAGIC_PENCIL_SPEC.md`: Specifica tecnica per lo strumento di modifica mirata.
- `scripts/cleanup_orphaned_files.py`: Pulisce lo Storage orfano.
- `scripts/cleanup_zombie_projects.py`: Pulisce i documenti `projects` senza sessione.
