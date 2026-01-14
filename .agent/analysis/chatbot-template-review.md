# 📊 RenovAI System Architecture Status

## ✅ Implementazione Attuale

### 1. **Core AI Engine**
- **Chat Model**: `gemini-3-flash-preview` (Logic & Reasoning)
- **Vision Model**: `gemini-3-pro-image-preview` ("Nano Banana Pro" - Architect & Painter)
- **Framework**: Vercel AI SDK 4.0 con Data Stream Protocol

### 2. **JIT Visualization Pipeline**
Architettura "Just-In-Time" implementata per la generazione immagini:
```mermaid
graph LR
    A[User Photo] --> B[Triage (Flash)]
    B --> C[Architect (Flash)]
    C --> D[Painter (Nano Banana Pro)]
    D --> E[Final Render]
```
- **Triage**: Analisi strutturale e classificazione stanza
- **Architect**: Generazione "Locked Prompt" con vincoli geometrici
- **Painter**: Rendering ad alta fedeltà (Temperature 0.2)

### 3. **Smart Tooling Framework**
Integrazione tools personalizzati con Zod schema validation:
- `generate_render`: Trigger sistema visivo
- `get_market_prices`: Perplexity integration per prezzi real-time (Max 5 righe)
- `submit_lead_data`: Cattura dati utente e salva su Firestore

### 4. **Safety & Guardrails** (Attivi)
- **System Prompt**: Definizione rigida del comportamento (Mode A: Architetto / Mode B: Geometra)
- **Anti-Jailbreak**: Regole "Tolleranza Zero" su formattazione prezzi
- **Session Security**: Validazione `sessionId` obbligatoria
- **Rate Limiting**: IP-based throttling

---

## 🔧 Prossimi Step Tecnologici

### 1. **Context Management Avanzato**
- Implementare `experimental_providerMetadata` per tracking token usage preciso
- Persistenza vettoriale per memoria a lungo termine (in valutazione)

### 2. **Performance Optimization**
- Implementare caching Redis per query prezzi frequenti
- Ottimizzare latenza "Nano Banana Pro" con cold-start mitigation

### 3. **Analytics**
- Dashboard per monitoraggio conversion rate (Lead Generation)
- Analisi qualità output visivi (User Feedback Loop)

---

## 📝 Note Architetturali

Il passaggio a **Gemini 3** ha permesso di:
1. Migliorare la comprensione geometrica delle stanze (meno allucinazioni spaziali)
2. Ridurre drasticamente la latenza del chatbot conversazionale
3. Unificare lo stack su Google Cloud Vertex AI (rimosso legacy REST API)
