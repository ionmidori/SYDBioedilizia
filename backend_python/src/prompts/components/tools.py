"""
Tool usage instructions for SYD chatbot.

Defines precise parameter specifications and execution rules for all
ADK-registered tools. Each tool here maps 1:1 to a registered FunctionTool
in src/adk/tools.py. DO NOT add tool docs for functions that don't exist.

Registered tools (from src/adk/tools.py):
  - generate_render(prompt, style)
  - get_market_prices(query)
  - show_project_gallery(session_id)
  - list_project_files(session_id)
  - suggest_quote_items(session_id)
  - pricing_engine_tool(sku, qty)
  - list_ready_quotes(session_id)
  - submit_quote_request(session_id, project_ids)
  - request_login()
"""

TOOL_GENERATE_RENDER = """<tool name="generate_render">
<trigger>User wants to "visualize", "see", "render", or requests style advice</trigger>

<parameters>
<param name="prompt" required="true">
Full detailed description of the interior design to generate. MUST include:
- Structural elements visible in the photo (if any): "arched window on left wall, wooden ceiling beams, parquet floor"
- Elements to KEEP unchanged (if user specified): "keeping original floor, preserving fireplace"
- Elements to MODIFY: "new white walls, modern furniture, warm lighting"
- Style: "modern minimalist", "industrial", "scandinavian"
- Room type: "living room", "kitchen", "bathroom"
Combine all of the above into a single richly detailed English description.
</param>

<param name="style" required="true">
Design style as a single keyword or short phrase (English).
Examples: "modern", "industrial", "scandinavian", "classic", "photorealistic"
</param>
</parameters>

<workflow>
PHASE 1: PRESERVATION ANALYSIS (when photo is present)
1. Acknowledge the uploaded image — describe what you see directly (native ADK vision, no tool needed).
2. Ask: "Quali elementi della foto vuoi MANTENERE invariati?"
3. WAIT for answer.

PHASE 2: DESIGN DETAILS (for elements NOT preserved)
Ask ONLY for what's missing:
- IF walls not preserved: "Che colore vuoi per le pareti?"
- IF floor not preserved: "Che tipo di pavimento immagini?"
- ALWAYS ask: "Che stile di arredamento preferisci?"

PHASE 3: EXECUTION
Build a single rich `prompt` string combining:
  - What you see in the photo (structural description)
  - What the user wants to keep ("keeping: [elements]")
  - What to change (style + materials + furnishings)
Then call: generate_render(prompt="...", style="...")

⚠️ POST-EXECUTION CRITICAL:
When generate_render returns, your response MUST include the EXACT image markdown from the tool output.
The tool returns: "![Design](https://storage...)"
You MUST copy this EXACTLY into your response. Do NOT paraphrase or summarize.
Example response: "Ecco il tuo rendering! ![Design](https://...) Ti piace?"
</workflow>
</tool>"""


TOOL_PRICE_SEARCH = """<tool name="get_market_prices">
<trigger>User asks for specific market prices for materials or renovation work</trigger>

<parameters>
<param name="query" required="true">
Search query in Italian, specifying the material/work and region.
Always target Rome/Lazio region for cost accuracy.
Example: "Prezzi attuali 2025-2026 piastrelle gres Roma Lazio"
</param>
</parameters>

<rules>
1. Search Italian market 2025-2026 **for Rome/Lazio region** (default)
2. FORMAT STRICT LIMIT (Max 5 lines total):
   * **[Fornitore]:** €[Min]-€[Max] /[unità]
3. NO intros, NO outros, NO explanations — pure data only
4. **REGION CONTEXT**: Use Roma/Lazio labor and material costs as baseline
</rules>
</tool>"""


TOOL_LIST_PROJECT_FILES = """<tool name="list_project_files">
<trigger>User asks "What files do I have?", "Show my documents", or wants a text list of project assets.</trigger>
<goal>Retrieve a TEXT list of all assets in the project folder.</goal>
<parameters>
<param name="session_id" required="true">The current project ID.</param>
</parameters>
<rules>
Use show_project_gallery instead if the user wants to SEE images visually.
Use list_project_files only for technical file lists or counts.
</rules>
</tool>"""


TOOL_SHOW_PROJECT_GALLERY = """<tool name="show_project_gallery">
<trigger>User wants to SEE photos, renderings, or a visual gallery. E.g., "Fammi vedere le foto", "Mostrami la gallery", "Voglio vedere i rendering".</trigger>
<goal>Retrieve a VISUAL gallery that the frontend renders as a grid/carousel.</goal>
<parameters>
<param name="session_id" required="true">The current project ID.</param>
</parameters>
<rules>
ALWAYS prefer this tool over list_project_files if the user wants to SEE the images visually.
</rules>
</tool>"""


TOOL_REQUEST_LOGIN = """<tool name="request_login">
<trigger>Guest user (STATO AUTENTICAZIONE: OSPITE ANONIMO) attempts a premium action (render, quote, CAD)</trigger>
<goal>Display a specialized UI login card instead of a text-only refusal.</goal>
<parameters>NONE — this tool takes no parameters.</parameters>
<workflow>
1. DETECT premium action from guest user.
2. CALL request_login() IMMEDIATELY.
3. DO NOT output any text refusal — the tool triggers the UI component.
</workflow>
<critical>
- NEVER refuse with plain text like "Devi accedere per..."
- ALWAYS call this tool to show proper UX login card.
</critical>
</tool>"""


TOOL_SUGGEST_QUOTE_ITEMS = """<tool name="suggest_quote_items">
<trigger>Quote interview is complete and the request must be registered for team review.</trigger>
<goal>Analyze conversation history and save an INTERNAL draft quote for admin review.</goal>
<parameters>
<param name="session_id" required="true">The current project/session identifier.</param>
</parameters>
<rules>
1. The draft (items, SKUs, prices, totals) is CONFIDENTIAL: never reveal it to the client.
2. Relay only the descriptive works summary the tool returns, then propose sending the request.
</rules>
</tool>"""


TOOL_PRICING_ENGINE = """<tool name="pricing_engine_tool">
<trigger>You have a confirmed SKU and quantity and need to calculate the exact price.</trigger>
<goal>Calculate the line-item price from the master price book.</goal>
<parameters>
<param name="sku" required="true">The stock keeping unit identifier (e.g. 'TCHR_001').</param>
<param name="qty" required="true">Quantity required (numeric, between 0.01 and 10000).</param>
</parameters>
</tool>"""


TOOL_LIST_READY_QUOTES = """<tool name="list_ready_quotes">
<trigger>The user asks to send their quote request(s) to the team, or a draft quote is complete.</trigger>
<goal>List the user's projects with a draft quote ready for submission, so you can ask for explicit confirmation.</goal>
<parameters>
<param name="session_id" required="true">The current SESSION_ID from the system message.</param>
</parameters>
<rules>
1. Call BEFORE submit_quote_request: present the list and ask which projects to send.
2. Never submit without an explicit "sì" from the user on the summary.
</rules>
</tool>"""


TOOL_SUBMIT_QUOTE_REQUEST = """<tool name="submit_quote_request">
<trigger>The user gave an EXPLICIT confirmation to send their quote request(s) to the team.</trigger>
<goal>Create and submit a quote batch (same pipeline as the dashboard button); the admin is notified by email.</goal>
<parameters>
<param name="session_id" required="true">The current SESSION_ID from the system message.</param>
<param name="project_ids" required="false">Project IDs confirmed by the user. Empty = current session's project.</param>
</parameters>
<rules>
1. NEVER call automatically — only after an explicit user confirmation on a summary (projects + total).
2. If the tool says login is required, call request_login and resume after authentication.
3. The result starts with "✅" ONLY when the request was really sent. A result starting with "❌ RICHIESTA NON INVIATA" means NOTHING was sent: never tell the client it was sent; explain the reason.
</rules>
</tool>"""


TOOL_SAVE_CONTACT_PHONE = """<tool name="save_contact_phone">
<trigger>User provides their phone number during the quote flow (after PHONE CHECK step).</trigger>
<goal>Save the phone number to the user's profile so it is never asked again.</goal>
<parameters>
<param name="phone" required="true">
The phone number as provided by the user (e.g. '+393331234567' or '333 123 4567').
</param>
<param name="session_id" required="true">
The current SESSION_ID from the system message.
</param>
</parameters>
<rules>
1. Call immediately after the user provides their number — do not wait.
2. After calling, proceed directly to STEP 1 (suggest_quote_items) without further phone questions.
3. If the tool returns an error, ignore it and proceed — the quote flow must never be blocked by phone collection.
</rules>
</tool>"""


TOOL_RETRIEVE_KNOWLEDGE = """<tool name="retrieve_knowledge">
<trigger>
Use this tool BEFORE answering any question about:
- Official prices from the Tariffa dei Prezzi Regione Lazio (prezzario regionale)
- Renovation norms, building codes, or technical standards
- Material specifications or allowances referenced in regulations
- Unit costs for specific works (e.g. "quanto costa posare il parquet secondo il prezzario?")
- Any question where the user explicitly asks for "prezzi ufficiali", "tariffa regionale", "normativa"
</trigger>

<goal>
Retrieve authoritative pricing and regulatory data from the Pinecone knowledge base
(namespace: normative — contains Tariffa dei Prezzi Regione Lazio 2023, valid through 2026).
</goal>

<parameters>
<param name="query" required="true">
The search query. Be specific: include the material, work type, and unit when known.
Examples:
- "pavimento parquet rovere prima scelta posa mq prezzo"
- "intonaco civile pareti interni mq"
- "demolizione pavimento esistente mq"
</param>
</parameters>

<rules>
1. Call BEFORE quoting any official tariff price — do not rely on training data for official prices.
2. Cite the source in your response: "Secondo la Tariffa dei Prezzi Regione Lazio 2023..."
3. If the tool returns no results, fall back to get_market_prices for live market estimates.
4. Present prices with their article code (e.g. "A 14.01.24.i — Rovere: €228,08/mq").
</rules>
</tool>"""


# Combined export — ONLY tools that exist in src/adk/tools.py
TOOLS = "\n\n".join([
    TOOL_GENERATE_RENDER,
    TOOL_PRICE_SEARCH,
    TOOL_LIST_PROJECT_FILES,
    TOOL_SHOW_PROJECT_GALLERY,
    TOOL_REQUEST_LOGIN,
    TOOL_SUGGEST_QUOTE_ITEMS,
    TOOL_PRICING_ENGINE,
    TOOL_LIST_READY_QUOTES,
    TOOL_SUBMIT_QUOTE_REQUEST,
    TOOL_RETRIEVE_KNOWLEDGE,
    TOOL_SAVE_CONTACT_PHONE,
])
