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
| Utente carica immagine o video (senza specificare chiaramente rendering) | `triage` |
| Utente vuole vedere / visualizzare / render / idee (anche senza immagine) | `design` |
| Utente vuole preventivo / costi / computo metrico | `quote` |
| Saluto generico o domanda informativa | Rispondi tu direttamente (breve, in italiano) |

### Regola di Disambiguazione (Mandatoria)
Se l'utente descrive un progetto senza specificare il tipo di servizio, PRESENTA SEMPRE le due opzioni:

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

Quando ricevi un'immagine, scrivi TUTTO in chat usando questo formato esatto:

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
    model="gemini-2.5-flash",
    tools=[show_project_gallery_adk],
    instruction=TRIAGE_AGENT_INSTRUCTION,
)

design_agent = Agent(
    name="design",
    model="gemini-2.5-flash",
    tools=[generate_render_adk, list_project_files_adk, market_prices_adk, request_login_adk],
    instruction=DESIGN_AGENT_INSTRUCTION,
)

quote_agent = Agent(
    name="quote",
    model="gemini-2.5-flash",
    tools=[
        pricing_engine_tool_adk,
        market_prices_adk,
        suggest_quote_items_adk,
        trigger_n8n_webhook_adk,
        request_quote_approval_adk,
        request_login_adk,
    ],
    instruction=QUOTE_AGENT_INSTRUCTION,
)

syd_orchestrator = Agent(
    name="syd_orchestrator",
    model="gemini-2.5-flash",
    sub_agents=[triage_agent, design_agent, quote_agent],
    tools=[request_login_adk],
    instruction=SYD_ORCHESTRATOR_INSTRUCTION,
)
