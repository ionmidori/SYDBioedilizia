
# 🏗️ Backend System Analysis: Image Generation & Quote Flow

Questo documento analizza in dettaglio il flusso backend (v2.0 Hybrid Architecture) per la gestione di **Rendering AI** e **Creazione Preventivi**, utilizzando un approccio ad Agenti Intelligenti (LangGraph) e integrazioni deterministiche.

---

## 🗺️ System Flow Diagram (n8n Style)

Il seguente schema illustra il percorso dei dati dall'input dell'utente fino alla generazione dell'asset e al salvataggio nel DB.

```mermaid
graph LR
    %% ---------------- STYLES (n8n Aesthetic) ----------------
    classDef trigger fill:#40C4FF,stroke:#01579B,stroke-width:2px,color:#000,rx:10,ry:10;
    classDef router fill:#FFD600,stroke:#FF6F00,stroke-width:2px,color:#000,rx:10,ry:10;
    classDef logic fill:#9C27B0,stroke:#4A0072,stroke-width:2px,color:#fff,rx:10,ry:10;
    classDef action fill:#00E676,stroke:#1B5E20,stroke-width:2px,color:#000,rx:5,ry:5;
    classDef db fill:#F44336,stroke:#B71C1C,stroke-width:2px,color:#fff,rx:5,ry:5,stroke-dasharray: 5 5;
    classDef ext fill:#607D8B,stroke:#263238,stroke-width:2px,color:#fff,rx:5,ry:5;

    %% ---------------- FLOW ----------------
    
    subgraph INPUT ["📡 TIER 1: Ingestione"]
        Webhook_Chat("⚡ Chat Webhook<br/>(WebSocket Stream)"):::trigger
        Webhook_Upload("⚡ File Upload<br/>(REST API)"):::trigger
    end

    subgraph BRAIN ["🧠 TIER 2: Orchestrazione (LangGraph)"]
        Router{"twisted_rightwards_arrows<br/>Router"}:::router
        Reasoning[🤔 Reasoning Node<br/>(Gemini 2.5 Flash)]:::logic
        Execution("⚙️ Execution Node"):::logic
    end

    subgraph TOOLS ["🛠️ TIER 3: Tools & Actions"]
        Render("🎨 Generated Render"):::action
        Lead("📝 Submit Lead"):::action
        Analyze("👁️ Analyze Room"):::action
    end

    subgraph STORAGE ["💾 TIER 4: Persistence"]
        DB("🗄️ Firestore"):::db
        Storage("📦 Cloud Storage"):::db
        GeminiAPI("✨ Gemini API"):::ext
    end

    %% ---------------- CONNECTIONS ----------------
    
    %% Input Layer
    Webhook_Upload -->|"1. Upload File"| Storage
    Webhook_Upload -->|"2. Return URL"| Webhook_Chat
    Webhook_Chat -->|"3. User Msg + URL"| Router

    %% Reasoning Layer
    Router -->|"Simple Text"| Execution
    Router -->|"Complex Request"| Reasoning
    Reasoning -->|"Plan: Render"| Execution

    %% Execution Layer
    Execution -->|"Switch: Render"| Render
    Execution -->|"Switch: Quote"| Lead
    Execution -->|"Switch: Analyze"| Analyze

    %% External Calls
    Render -->|"1. Download"| Storage
    Render -->|"2. Triage"| Analyze
    Render -->|"3. Generate"| GeminiAPI
    GeminiAPI -->|"4. New Image"| Render
    
    %% Persistence
    Render -->|"5. Save Metadata"| DB
    Lead -->|"Save Contact"| DB
    Analyze -->|"Save Data"| DB

    %% Feedback Loop
    Execution -->|"Show Widget"| Webhook_Chat
```

---

## 📂 File Architecture Breakdown

Di seguito l'analisi dei file critici coinvolti in questi flussi, con la loro responsabilità specifica.

### 1. Ingestione & Orchestrazione (The Brain)
Questi file gestiscono l'ingresso della richiesta e la decisione su cosa fare.

*   `backend_python/main.py`: **EntryPoint**. Gestisce l'endpoint WebSocket/Stream `/chat/stream`, l'autenticazione JWT e inizializza il grafo dell'agente. Riceve anche i `media_urls` e li inietta nel contesto.
*   `backend_python/src/graph/agent.py`: **Il Cervello**. Definisce il Grafo LangGraph.
    *   **Reasoning Node**: Usa **Gemini 2.5 Flash** per "pensare" prima di agire (Chain of Thought). Decide SE serve un render o un preventivo.
    *   **Execution Node**: Esegue gli strumenti pianificati in modo deterministico.
*   `backend_python/src/graph/tools_registry.py`: Registro centrale che mappa le stringhe (es. "generate_render") alle funzioni Python effettive.

### 2. Generazione Rendering (The Artist)
Il flusso che trasforma un testo (o un'immagine esistente) in una nuova visualizzazione.

*   `backend_python/src/tools/generate_render.py`: **Tool Wrapper**.
    *   Gestisce la logica di business: scarica l'immagine sorgente (se I2I), chiama l'analista (`analyze_room`), prepara il prompt "architettonico" e infine invoca l'API.
    *   Gestisce il **Fallback**: Se la modalità "Architect" fallisce, usa un prompt semplice.
    *   **Auto-Indexing**: Dopo la generazione, chiama `save_file_metadata` per mostrare subito il render in Galleria.
*   `backend_python/src/api/gemini_imagen.py`: **Client API**.
    *   Contiene le chiamate "raw" alle API di Google (GenAI SDK).
    *   Gestisce due modalità: `generate_image_t2i` (Text-to-Image) e `generate_image_i2i` (Image-to-Image), utilizzando il modello **Gemini 3 Image Preview**.
    *   Configura i parametri di sicurezza e creatività (Temperature 0.4).

### 3. Gestione Preventivi & Leads (The Clerk)
Attualmente il sistema "Preventivi" è un modulo di raccolta dati strutturati (Lead Generation).

*   `backend_python/src/tools/submit_lead.py`: **Tool Wrapper**.
    *   Espone all'Agent la capacità di "Salvare un contatto".
    *   Richiede: Nome, Email, Dettagli Progetto.
*   `backend_python/src/db/leads.py`: **DB Layer**.
    *   Scrive fisicamente il record nella collezione `leads` (e potenzialmente `quotes` in futuro) su Firestore.

### 4. Persistenza & Galleria (The Librarian)
Assicura che nessun file vada perso e tutto sia visibile all'utente.

*   `backend_python/src/db/messages.py`: Contiene la funzione critica `save_file_metadata`.
    *   Ogni volta che viene generata un'immagine o caricato un file, questa funzione crea un "puntatore" nella collezione `projects/{id}/files`.
    *   È il motivo per cui ora le immagini appaiono nella "Galleria Globale".
*   `backend_python/src/api/upload.py`: Gestisce l'upload diretto dei file utente (prima che arrivino alla chat).

---

## 🔄 Lifecycle di una Richiesta di Rendering

1.  **Input**: Utente carica foto cucina e scrive: *"Vorrei vederla in stile moderno industriale"*.
2.  **Upload**: `src/api/upload.py` salva foto su Storage e restituisce URL.
3.  **Routing**: `agent.py` riceve URL + Testo. Il **Reasoning Node** analizza: "L'utente vuole modificare l'immagine allegata -> Tool richiesto: `generate_render` (mode='modification')".
4.  **Execution**:
    *   `generate_render.py` scarica la foto.
    *   Chiamata a `analyze_image_triage` per confermare che sia una stanza.
    *   Costruzione Prompt Architettonico (es. *"Preserve geometry... change cabinets to matte black steel..."*).
    *   Chiamata a `gemini_imagen.py`.
5.  **Output**:
    *   Immagine generate (Base64) -> Upload su Firebase Storage (`renders/`).
    *   URL risultante salvato in Firestore (`save_file_metadata`).
    *   L'Agent risponde: *"Ecco la tua cucina in stile industriale..."* mostrando il widget del render.

