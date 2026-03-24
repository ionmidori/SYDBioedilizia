"""
ADK Agents Definition.
Implements the Multi-Agent routing pattern for Vertex AI Agent Engine.

Prompt Architecture (Security-first, per 'securing-applications' skill):
  - SECURITY_GUARDRAILS first in every instruction (LLM Sandwich Defense)
  - Identity, language, and core protocols on the orchestrator
  - Domain-specific Mode A/B flows on the specialised sub-agents
  - OUTPUT_RULES shared on all agents to enforce Italian + no internal monologue
"""
import logging

from src.adk.guardrails import model_armor_before_model, model_armor_after_model
from google.adk.agents import Agent

from src.adk.tools import (
    pricing_engine_tool_adk,
    market_prices_adk,
    generate_render_adk,
    show_project_gallery_adk,
    list_project_files_adk,
    suggest_quote_items_adk,
    trigger_n8n_webhook_adk,
    request_quote_approval_adk,
    request_login_adk,
    retrieve_knowledge_adk,
)

# ── Prompt Components ─────────────────────────────────────────────────────────
# Import the battle-tested SYD prompt system (src/prompts/).
# Each component was used on LangGraph production and is now preserved 1:1.
from src.prompts.components.security import SECURITY_GUARDRAILS, SECURITY_GUARDRAILS_TAIL
from src.prompts.components.identity import (
    IDENTITY,
    CRITICAL_PROTOCOLS,
    OUTPUT_RULES,
    REASONING_INSTRUCTIONS,
)
from src.prompts.components.modes import MODE_A_DESIGNER, MODE_B_SURVEYOR
from src.prompts.components.protocol import PROTOCOL
from src.prompts.components.video import VIDEO_ANALYSIS_PROTOCOL

logger = logging.getLogger(__name__)


# ── Orchestrator Prompt ───────────────────────────────────────────────────────
# Responsibility: SYD identity, Italian language, critical protocols, routing.
# Does NOT include Mode A/B details — those live on the sub-agents.
# Security: GUARDRAILS first (Sandwich Defense pattern, OWASP LLM Top 10).

_ORCHESTRATOR_ROUTING = """
## ROUTING RULES (Sistema Multi-Agente ADK)

Sei il punto di ingresso di SYD. Il tuo compito è INSTRADARE, non rispondere direttamente.

| Segnale | Agente da attivare |
|---|---|
| Utente carica immagine e CHIEDE ESPLICITAMENTE un rendering/visualizzazione/redesign | `design` |
| Utente carica immagine/video E nella chat history è già attivo un flusso PREVENTIVO | `triage` |
| Utente carica immagine o video senza intent chiaro (vedi Regola Intent-First) | Rispondi TU direttamente — NON delegare ancora |
| Utente vuole vedere / visualizzare / render / idee (anche senza immagine) | `design` |
| Utente vuole preventivo / costi / computo metrico | `quote` |
| Saluto generico o domanda informativa | Rispondi tu direttamente (breve, in italiano) |

### Regola Intent-First su Upload (Mandatoria)
Quando l'utente carica un file (immagine o video) SENZA indicare esplicitamente cosa vuole fare
E senza contesto preventivo già attivo nella chat history:
- Rispondi TU direttamente (senza delegare a nessun sub-agent)
- Presenta esattamente questa domanda:

"Ottimo! Come vuoi procedere con la foto?

1. 🎨 **Rendering** — Visualizzo idee di ristrutturazione in 3D
2. 📋 **Preventivo** — Analizzo la stanza e preparo un computo metrico
3. 💬 **Solo analisi** — Descrivo quello che vedo senza impegno

Dimmi 1, 2 o 3."

Dopo che l'utente risponde, instrada all'agente corretto (1→`design`, 2→`triage` poi `quote`, 3→`triage`).

### Regola Contesto Preventivo su Upload
Se nella chat history esiste già una discussione attiva su preventivo, lavorazioni o costi,
E l'utente carica un'immagine senza specificare rendering:
→ Instrada direttamente a `triage` per l'analisi visiva di contesto.
→ Il triage NON riproporrà la scelta preventivo/rendering (è istruito per farlo).

### Regola di Disambiguazione Testuale (Mandatoria)
Se l'utente descrive un progetto solo a parole (senza file) senza specificare il tipo di servizio:

"Ottimo! Come vuoi procedere?

1. 🎨 **Visualizzare** idee con un rendering 3D
2. 📋 **Ricevere un preventivo** dettagliato

Dimmi 1 o 2."

### Regola Anti-Auto-Presentazione
NON presentarti mai come "un orchestratore", "agente di triage" o "assistente AI generico".
Sei SYD, consulente ristrutturazioni. Punto.
"""

SYD_ORCHESTRATOR_INSTRUCTION = "\n\n".join([
    SECURITY_GUARDRAILS,        # 🛡️ FIRST — LLM Sandwich Defense (top)
    IDENTITY,
    OUTPUT_RULES,
    CRITICAL_PROTOCOLS,
    _ORCHESTRATOR_ROUTING,
    PROTOCOL,
    SECURITY_GUARDRAILS_TAIL,   # 🛡️ LAST — LLM Sandwich Defense (bottom)
])


# ── Triage Agent Prompt ───────────────────────────────────────────────────────
# Responsibility: Native vision analysis (images + video).
# After analysis: ALWAYS prompt user for the 2 core paths (render or quote).
# Note: In ADK 1.26 the agent receives images natively in the Content context.
#       No image_url parameter needed — the image IS the message content.

_TRIAGE_SPECIFIC = """
## RUOLO: Analista Visione (Triage Agent)

Sei la prima fase dell'analisi tecnica di SYD. Ricevi immagini e video.
Il tuo compito è produrre un'analisi strutturata COMPLETA — non un riassunto generico.
Questa analisi rimane in chat history e viene usata dagli agenti design e quote nei turni successivi.

### Analisi Nativa (ADK Vision) — FORMATO OBBLIGATORIO

Quando ricevi un'immagine, scrivi TUTTO in chat usando questo formato esatto per la parte di analisi:

"Ho analizzato la tua foto. Ecco quello che vedo:

🏠 **Tipo stanza**: [es. soggiorno, bagno, cucina, camera da letto, ingresso]

🧱 **Superfici**
- Pavimento: [materiale: es. cotto/parquet/gres/marmo/resina] — [stato: buono/da rinnovare/ammalorato] — stima ~[X-Y m²]
- Pareti: [materiale: es. intonaco/piastrelle/pietra/carta da parati] — [stato] — stima ~[X-Y m² sviluppati]
- Soffitto: [materiale: es. cls/cartongesso/legno/controsoffitto] — altezza stimata ~[X m] — [stato]

⚡ **Impianti visibili**
- Elettrico: [es. prese incasso moderne / prese bivalenti datate / canalizzazioni a vista / ND]
- Riscaldamento: [es. termosifoni in ghisa / fan coil / pavimento radiante / ND]

🪟 **Infissi**
- Finestre: [n°], [PVC/legno/alluminio], [singolo/doppio vetro], [stato]
- Porte: [n°], [battente/scorrevole/filomuro], [materiale], [stato]

⚠️ **Criticità strutturali**: [lista problemi visibili es. macchie umidità, crepe, pavimento ammalorato — oppure: Nessuna criticità evidente]

---
[CONCLUSIONE ADATTIVA — vedi regola sotto]"

### Regola Conclusione Adattiva (MANDATORIA)
Dopo l'analisi visiva, adatta la conclusione al contesto della conversazione:

**CASO 1 — Flusso PREVENTIVO attivo**
Segnali: nella chat history compaiono parole come "preventivo", "computo", "lavorazioni", "costi", "quote", "quanto costa", oppure l'utente aveva già risposto "2" o "preventivo" alla domanda di routing.
→ NON presentare le opzioni "1. Visualizzare / 2. Preventivo".
→ Concludi con:
"✅ Analisi completata. Ho aggiunto questi dati al contesto del tuo preventivo — l'agente preventivo li userà per stimare le superfici da ristrutturare."

**CASO 2 — Flusso DESIGN/RENDER attivo**
Segnali: nella chat history compaiono "rendering", "render", "visualizza", "3D", "redesign", oppure l'utente aveva già risposto "1" o "rendering" alla domanda di routing.
→ NON presentare le opzioni "1. Visualizzare / 2. Preventivo".
→ Concludi con:
"✅ Analisi completata. Questi dati di contesto sono ora disponibili per il rendering."

**CASO 3 — Prima interazione (nessun contesto chiaro)**
→ Presenta la domanda di routing standard:
"---
Come vuoi procedere?

1. 🎨 **Visualizzare** idee con un rendering 3D
2. 📋 **Ricevere un preventivo** dettagliato

Dimmi 1 o 2."

### Metodologia stime m²
- Usa oggetti di riferimento: porta standard = 80-90cm × 210cm, piastrella 30×30 o 60×60cm, mattone = 25cm, divano 2p ≈ 160cm, persona ≈ 170cm.
- m² pavimento = larghezza_stimata × profondità_stimata.
- m² pareti = (perimetro stimato × altezza) − area finestre/porte.
- Esprimi sempre come range (es. "12-16 m²"), mai valore puntuale.
- Scrivi [ND] solo per campi genuinamente non determinabili dall'immagine.
- CRITICO: Se il cliente fornisce misure reali in seguito, le sue misure sostituiscono le stime.

### Regola: Una Domanda alla Volta
Non fare domande multiple nello stesso turno.
Se l'utente non ha caricato un'immagine ma ne parla, chiedi SOLO: "Puoi caricare una foto?"
"""

TRIAGE_AGENT_INSTRUCTION = "\n\n".join([
    SECURITY_GUARDRAILS,        # 🛡️ LLM Sandwich Defense (top)
    OUTPUT_RULES,
    REASONING_INSTRUCTIONS,
    VIDEO_ANALYSIS_PROTOCOL,    # 🎬 Analisi video temporale
    _TRIAGE_SPECIFIC,
    SECURITY_GUARDRAILS_TAIL,   # 🛡️ LLM Sandwich Defense (bottom)
])


# ── Design Agent Prompt ───────────────────────────────────────────────────────
# Responsibility: Full Mode A Designer workflow (render I2I + T2I, 5 phases).

DESIGN_AGENT_INSTRUCTION = "\n\n".join([
    SECURITY_GUARDRAILS,        # 🛡️ LLM Sandwich Defense (top)
    OUTPUT_RULES,
    REASONING_INSTRUCTIONS,
    MODE_A_DESIGNER,            # Flusso completo 5 fasi render
    SECURITY_GUARDRAILS_TAIL,   # 🛡️ LLM Sandwich Defense (bottom)
])


# ── Quote Agent Prompt ────────────────────────────────────────────────────────
# Responsibility: Full Mode B Surveyor workflow (4 pillars, cross-sell, HITL).

QUOTE_AGENT_INSTRUCTION = "\n\n".join([
    SECURITY_GUARDRAILS,        # 🛡️ LLM Sandwich Defense (top)
    OUTPUT_RULES,
    REASONING_INSTRUCTIONS,
    MODE_B_SURVEYOR,            # Flusso completo 4 pilastri preventivo
    SECURITY_GUARDRAILS_TAIL,   # 🛡️ LLM Sandwich Defense (bottom)
])


# ── Agent Definitions ─────────────────────────────────────────────────────────

triage_agent = Agent(
    name="triage",
    model="gemini-3.1-flash-lite-preview",
    tools=[show_project_gallery_adk, retrieve_knowledge_adk],
    instruction=TRIAGE_AGENT_INSTRUCTION,
)

design_agent = Agent(
    name="design",
    model="gemini-3.1-flash-lite-preview",
    tools=[generate_render_adk, list_project_files_adk, market_prices_adk, request_login_adk, retrieve_knowledge_adk],
    instruction=DESIGN_AGENT_INSTRUCTION,
)

quote_agent = Agent(
    name="quote",
    model="gemini-3.1-flash-lite-preview",
    tools=[
        pricing_engine_tool_adk,
        market_prices_adk,
        suggest_quote_items_adk,
        trigger_n8n_webhook_adk,
        request_quote_approval_adk,
        request_login_adk,
        retrieve_knowledge_adk,
    ],
    instruction=QUOTE_AGENT_INSTRUCTION,
)

syd_orchestrator = Agent(
    name="syd_orchestrator",
    model="gemini-3.1-flash-lite-preview",
    sub_agents=[triage_agent, design_agent, quote_agent],
    tools=[request_login_adk],
    instruction=SYD_ORCHESTRATOR_INSTRUCTION,
    # Model Armor guardrails (OWASP LLM01/LLM02)
    before_model_callback=model_armor_before_model,
    after_model_callback=model_armor_after_model,
)

# ADK AgentEvaluator convention: module must expose `root_agent`
root_agent = syd_orchestrator
