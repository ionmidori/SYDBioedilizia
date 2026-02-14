# Blueprint per l'Edilizia AI-Native: Architettura Resiliente e Sicura con Gemini

## 1. Executive Summary
**SYDBioedilizia** è una piattaforma **Enterprise AI-Native** che trasforma una foto scattata col cellulare in un progetto di ristrutturazione esecutivo, completo di preventivi reali e file tecnici CAD (DXF).

L'obiettivo è offrirla come **Case Study o Template Ufficiale per Google Project IDX**, dimostrando come costruire applicazioni GenAI di livello produzione che superano le sfide comuni: gestione di dati parziali, sicurezza dei dati sensibili, coordinamento multi-agente e sincronizzazione type-safe tra Backend e Frontend.

**Differenziatore Chiave**: SYD non è un wrapper di ChatGPT. È un sistema a **Swarm Architecture** che coordina 9 agenti specializzati, vede lo spazio fisico (Agentic Vision), calcola misure, genera planimetrie CAD e stima costi con prezzi reali.

---

## 2. Architettura del Sistema

### 2.1 Stack Tecnologico (3-Tier Enterprise)

```
┌──────────────────────────────────────────────────────────┐
│                    TIER 1: FRONTEND                       │
│  Next.js 16 • React Server Components • Material 3       │
│  Vercel Edge • SWR/Firestore Realtime • Zod Validation   │
├──────────────────────────────────────────────────────────┤
│                    TIER 2: BACKEND                        │
│  Python 3.12+ (FastAPI) • LangGraph Swarm Architecture   │
│  Google Cloud Run (Serverless) • Pydantic V2 Validation  │
├──────────────────────────────────────────────────────────┤
│                    TIER 3: DATA & AI                      │
│  Firebase Firestore • Firebase Storage • Firebase Auth    │
│  Gemini 2.5 Flash (Reasoning) • Gemini 1.5 Pro (Vision)  │
│  Google Imagen 3 (Rendering) • Perplexity API (Market)   │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Swarm Architecture: Il Grafo Decisionale (LangGraph)

Il cuore del sistema è un grafo a stati (`StateGraph`) con routing deterministico:

```
                    ┌─────────────┐
                    │  USER INPUT │
                    └──────┬──────┘
                           │
                  ┌────────▼────────┐
                  │   GATEKEEPER    │ ← IntentClassifier (Async)
                  │ (Entry Point)   │   Classifica: Reasoning vs Execution
                  └───┬─────────┬───┘
                      │         │
              ┌───────▼───┐ ┌───▼───────┐
              │ REASONING │ │ EXECUTION │
              │ (Tier 1)  │ │ (Tier 3)  │
              │ Gemini 2.5│ │ Gemini 2.5│
              │ Planning  │ │ + Tools   │
              └─────┬─────┘ └─────┬─────┘
                    │             │
              ┌─────▼─────┐      │ should_continue()
              │   ROUTER  │      │
              │ (Tier 2)  │  ┌───▼───┐
              │ Determin.  │  │ TOOLS │ ← 9 Agenti Specializzati
              └─────┬──────┘  └───┬───┘
                    │             │
                    └─────────────┘
                     ↻ Loop fino a END
```

**Flusso Chiave**:
1. Il **Gatekeeper** classifica l'intento (conversazione semplice vs. ragionamento complesso).
2. Il **Reasoning Node** genera un piano strutturato (`ReasoningStep`) con confidence score.
3. Il **Router Deterministico** (`route_step`) decide: eseguire tool, chiedere all'utente, o terminare.
4. L'**Execution Node** genera la risposta finale o invoca il tool specificato dal piano.
5. Il **Custom Tools Node** esegue il tool e aggiorna i flag di stato (User Journey tracking).

### 2.3 Registry degli Agenti (9 Tools Specializzati)

| # | Tool | Funzione | Modello AI |
|---|------|----------|------------|
| 1 | `analyze_room` | Analisi strutturale e materiali da foto | Gemini 1.5 Pro Vision |
| 2 | `plan_renovation` | Piano architetturale (Skeleton & Skin) | Gemini 2.5 Flash |
| 3 | `generate_render` | Rendering fotorealistico T2I/I2I | Imagen 3 |
| 4 | `generate_cad` | Generazione planimetrie DXF da foto | Gemini 1.5 Pro + `ezdxf` |
| 5 | `get_market_prices` | Prezzi reali di mercato | Perplexity Sonar |
| 6 | `save_quote` | Salvataggio preventivi strutturati | Firestore |
| 7 | `submit_lead` | Acquisizione contatti (Lead Capture) | Firestore |
| 8 | `list_project_files` | Inventario file del progetto | Firestore |
| 9 | `show_project_gallery` | Galleria rendering generati | Firestore |

---

## 3. Innovazioni Chiave

### 3.1 Agentic Vision (Gemini 1.5 Pro)
Il modulo `vision/triage.py` utilizza **Gemini 1.5 Pro** con **Code Execution** integrata per analizzare le immagini con un approccio Chain-of-Thought:
1. **Identificazione Visiva**: Classifica l'immagine (foto stanza, planimetria, schizzo).
2. **Estrazione Tecnica**: Usa Python per rilevare contorni, etichette OCR e scale.
3. **Analisi Condizionale**: Differenzia tra analisi stilistica (foto) e dimensionale (disegno tecnico).

### 3.2 Motore CAD (Foto → DXF)
Il tool `generate_cad` traduce i pixel di una foto in vettori geometrici, producendo file **DXF** compatibili con AutoCAD (R2010). Questa è una feature unica nel panorama delle app AI per l'edilizia, resa possibile dalla precisione spaziale di Gemini 1.5 Pro.

### 3.3 L'Architetto Digitale (Skeleton & Skin Methodology)
Il modulo `vision/architect.py` genera piani di ristrutturazione strutturati in 4 campi:
- **Structural Skeleton**: Geometria fissa (muri, finestre, scale).
- **Material Plan**: Materiali mappati allo stile richiesto.
- **Furnishing Strategy**: Arredi e decorazione specifici.
- **Technical Notes**: Metadati fotografici per il rendering.

### 3.4 Safety Layer (Pydantic Validation Loop)
Ogni dato generato dall'AI è intercettato dal sistema di validazione:
- **ReasoningStep** con `confidence_score` per bloccare azioni a bassa certezza.
- **RBTA (Role-Based Tool Access)** tramite `SOPManager` per limitare gli strumenti per fase.
- Se un valore è incoerente (es. `sqm=0`), il sistema forza il ricalcolo.

---

## 4. Resilienza dei Dati (Pattern "Strict Write, Loose Read")

### A. Prospettiva Frontend (Defensive Programming)
- **Problema**: Il frontend assume dati completi ("Happy Path only").
- **Soluzione**: Ogni componente degrada graziosamente con placeholder e skeleton loading.

### B. Prospettiva Backend (Data Integrity)
- **Problema**: Oggetti vuoti `{}` nel DB creano "dati zombie".
- **Soluzione**: Il DB contiene `ProjectDetails` valido oppure `null`. Zero vie di mezzo.

### C. Prospettiva AI (Type Safety End-to-End)
- **Problema**: Dati parziali passati all'LLM generano allucinazioni.
- **Soluzione**: Se il dato manca, il tipo è `null` e il prompt builder esclude quella sezione.

---

## 5. Economia e Scalabilità

| Metrica | Valore |
|---------|--------|
| **Costo per utente/mese** | €0.14 |
| **Driver principale** | AI Rendering & CAD (55% del budget) |
| **Costo AI Reasoning** | Trascurabile (<5% del budget) |
| **Scalabilità** | Lineare fino a 1.000+ utenti |
| **Free Tier Coverage** | Cloud Run, Firestore, Storage coperti al 100% fino a 500 utenti |

### Quota Management (Perplexity & Gemini)
- Limite rigido: **2 ricerche/giorno per progetto** (server-side enforcement).
- Scenario worst-case (60 ricerche/mese): l'utente costa €0.40/mese, ampiamente sostenibile.

---

## 6. Sicurezza

| Layer | Tecnologia | Funzione |
|-------|------------|----------|
| **Autenticazione** | Firebase Auth + Passkeys | Token verification su ogni endpoint protetto |
| **Certificazione** | Firebase App Check | Verifica autenticità client (anti-bot, anti-tampering) |
| **Validazione Input** | Pydantic V2 + Zod | Type safety double-layer (Backend + Frontend) |
| **Quota Abuse Prevention** | `src/tools/quota.py` | Rate limiting per tool sensibili |
| **RBTA** | `SOPManager` | Accesso ai tool condizionato alla fase del progetto |
| **Error Contract** | Global Exception Handler | Nessun errore 500 esposto: JSON `{error_code, message, request_id}` |

---

## 7. Developer Experience (Template IDX)

### One-Click Setup
Configurazione `.idx/dev.nix` per ambiente di sviluppo istantaneo:
- Frontend Next.js + Backend FastAPI pre-configurati.
- Environment variables template con `.env.example`.
- Script di avvio unificato (`npm run dev:web` + `npm run dev:py`).

### Modularità Estrema
- **Graph Factory Pattern**: Il grafo LangGraph è istanziato via factory con Dependency Injection, permettendo di sostituire LLM o tools senza modificare la logica.
- **Feature-Based Code Structure**: Codice organizzato per dominio (`src/services/{domain}/`, `src/api/routes/{domain}.py`).
- **Tool Plug-and-Play**: Aggiungere un nuovo agente richiede solo: definire il tool, aggiungerlo a `ALL_TOOLS` nella registry.

---

## 8. Roadmap Tecnica (Stato: 90% Completo)

### A. Backend & Database (✅ Completato)
1. Refactoring `create_project` → `construction_details=None`.
2. Validazione stringente vincoli (`gt=0`).
3. API Contract deterministico (invio esplicito `null`).
4. Sanitizzazione Service Layer (stringhe vuote → `None`).
5. Quota Perplexity: tracking "per progetto" (`src/tools/quota.py`).

### B. Frontend Type System (✅ Completato)
6. Aggiornamento `types/projects.ts` con `| null`.
7. Utility di defaulting per form (`lib/utils/project-defaults.ts`).

### C. Frontend Logic & Components (✅ Completato)
8. Optional Chaining & Fallback in `ProjectInfoCard.tsx`.
9. Stabilizzazione form in `ConstructionDetailsForm.tsx`.
10. Guardie client-side al submit.
11. Skeleton Loading per stati di fetch.

### D. Validazione & Sicurezza (✅ Completato)
12. Disaccoppiamento schemi Zod (rigoroso vs. permissivo).
13. Feedback errori inline nei form.
14. Idempotenza pulsanti (`isPending`).

### E. Test & Verifica (🚧 In Corso)
15. Unit test backend + User Flow Testing ("Creazione → Dashboard").

---

## 9. Conclusione

**SYDBioedilizia** non è una dashboard con un chatbot. È la dimostrazione industriale che le applicazioni GenAI possono essere costruite con:
- **Zero Allucinazioni Strutturali**: 9 agenti specializzati coordinati da un grafo deterministico.
- **Visione Artificiale Reale**: Da una foto a un file CAD professionale.
- **Costo Irrisorio**: €0.14/utente/mese grazie all'ottimizzazione dei modelli Google.
- **Sicurezza Enterprise**: 6 layer concentrici di protezione.

**Call to Action**: Proponiamo questo progetto come **template di riferimento per Google Project IDX**, dimostrando che l'ecosistema Google Cloud + Gemini è la piattaforma ideale per costruire il futuro del software AI-Native verticale. Il template riduce il time-to-market di un'app GenAI da mesi a giorni.
