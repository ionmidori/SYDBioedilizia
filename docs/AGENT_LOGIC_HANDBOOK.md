# Manuale Tecnico sulla Logica degli Agenti AI (Enterprise)

Questo documento funge da **Unica Fonte di Verità** per lo sviluppo, la gestione e il perfezionamento della logica degli agenti all'interno dell'ecosistema `renovation-next`. Aderisce rigorosamente ai principi dell'**Architettura Enterprise a 3 Livelli** per garantire scalabilità, determinismo e sicurezza.

## 1. Filosofia Architetturale: Il Modello a 3 Livelli

Non costruiamo "chatbot" monolitici. Costruiamo **Sistemi Agentici Gerarchici**.

### Livello 1: Direttive (La "Costituzione")
*   **Ruolo**: Governance Strategica e Identità.
*   **Componente**: `System Prompts` e `SOP` (Procedure Operative Standard).
*   **Responsabilità**: Definisce *CHI* è l'agente, *COSA* può o non può fare, e il *TONO* che deve utilizzare.
*   **Immutabilità**: Alta. Le modifiche qui richiedono un ampio consenso.
*   **Concetto Chiave**: "Le Direttive di Sistema non sono negoziabili".

### Livello 2: Orchestrazione (Il "Generale")
*   **Ruolo**: Pianificazione Tattica e Routing.
*   **Componente**: `Nodi LangGraph` (Dispatcher, Planner).
*   **Responsabilità**: Analizza l'intento dell'utente, scompone gli obiettivi complessi in sotto-task e instrada l'esecuzione a specialisti dedicati.
*   **Immutabilità**: Media. Si evolve con l'aggiunta di nuove capacità.
*   **Concetto Chiave**: "Pensa prima di agire". Non eseguire mai senza un piano.

### Livello 3: Esecuzione (Lo "Specialista")
*   **Ruolo**: Azione Operativa.
*   **Componente**: `Tool` (funzioni @tool) e `Sotto-Agenti` (es. Agente Codice, Agente CAD).
*   **Responsabilità**: Esegue azioni atomiche specifiche (Interrogare il DB, Generare un'immagine, Calcolare un prezzo). Restituisce dati grezzi o stato.
*   **Immutabilità**: Bassa. Aggiornato frequentemente per ottimizzare le performance.
*   **Concetto Chiave**: "Fai una sola cosa, ma falla perfettamente".

---

## 2. Strategia di Prompt Engineering Professionale

Per ottenere un comportamento di livello "Enterprise", utilizziamo il **Prompting Gerarchico**.

### A. Prompt di Livello 1: L'Identità di Sistema (Context Builder)
*Utilizzato in `src/graph/context_builder.py`*

**Pattern:** `[IDENTITÀ] + [VINCOLI] + [CAPACITÀ] + [FORMATO_OUTPUT]`

```markdown
# IDENTITÀ
Sei il Senior Architect AI di SYD Bioedilizia. Il tuo obiettivo è guidare gli utenti attraverso complessi progetti di ristrutturazione con precisione professionale e intuito creativo.

# VINCOLI (Le "Regole d'Oro")
1. MAI allucinare i prezzi. Usa lo strumento 'PriceEstimator'.
2. SE mancano dati specifici, CHIEDI all'utente. Non tirare a indovinare.
3. ADERISCI rigorosamente alle normative edilizie locali (Regolamento Italiano).
4. MANTIENI un tono professionale, rassicurante ed esperto.

# CAPACITÀ
- Hai accesso al Contesto di Progetto dell'utente (ID: {project_id}).
- Puoi generare rendering usando 'Imagen'.
- Puoi interrogare la 'KnowledgeBase' per specifiche tecniche.
```

### B. Prompt di Livello 3: Istruzioni per lo Specialista (Tool Definition)
*Utilizzato nelle docstring @tool o nelle descrizioni Pydantic.*

**Pattern:** `[VERBO_AZIONE] + [OGGETTO_SPECIFICO] + [PARAMETRI] + [ASPETTATIVA_RITORNO]`

```python
@tool
def calculate_insulation_cost(area_sqm: float, material_type: str) -> dict:
    """
    CALCOLA il costo stimato dell'isolamento termico.
    
    ARGOMENTI:
    - area_sqm: La superficie totale in metri quadrati.
    - material_type: Deve essere uno tra ['rockwool', 'eps', 'cork'].
    
    RITORNA:
    - Oggetto JSON con 'min_price', 'max_price' e 'currency'.
    """
```

---

## 3. Best Practices per la Gestione della Logica

1.  **Gestione Rigorosa dello Stato (LangGraph)**:
    *   Usa uno schema di `Stato` tipizzato (Pydantic) per passare dati tra i nodi.
    *   **MAI** affidarsi alla cronologia implicita del prompt per variabili critiche. Memorizzale nello Stato (es. `state.project_budget`).

2.  **Classificazione degli Intenti (Il Router)**:
    *   Non lasciare che l'LLM indovini cosa fare. Usa un nodo `IntentClassifier` dedicato per categorizzare l'input (es. `Update_Budget`, `Generate_Render`, `General_Chat`) *prima* di invocare l'agente principale.

3.  **Guardrail Deterministici**:
    *   Avvolgi l'output dei tool in una logica di validazione. Se l'LLM genera un JSON, esegui il parsing con Pydantic. Se fallisce, attiva immediatamente un ciclo di `SelfCorrection`.

4.  **Il Mandato "Chain of Thought"**:
    *   Per richieste complesse, forza l'Agente a produrre un blocco `<thinking>` prima della risposta finale.
    *   *Prompt Injection*: "Prima di rispondere, spiega il tuo ragionamento passo dopo passo in un tag <thinking>."

## 4. Workflow per lo Sviluppatore (Aggiornamento Logica)

Quando è necessario migliorare il comportamento del chatbot:

1.  **Identifica il Livello**: Si tratta di un problema di tono (Livello 1), un errore di routing (Livello 2) o un fallimento di un tool (Livello 3)?
2.  **Modifica il File Corretto**:
    *   Livello 1: `src/prompts/system_prompts.py`
    *   Livello 2: `src/graph/nodes/orchestrator.py`
    *   Livello 3: `src/tools/`
3.  **Test con Replay**: Usa LangSmith o i log locali per riprodurre la struttura della conversazione fallita contro la nuova logica.
