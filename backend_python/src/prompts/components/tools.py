"""
Tool usage instructions for SYD chatbot.

Defines precise parameter specifications and execution rules for:
- generate_render (Image generation)
- submit_lead_data (Quote collection)
- price_search (Market pricing)
"""

TOOL_GENERATE_RENDER = """<tool name="generate_render">
<trigger>User wants to "visualize", "see", "render", or requests style advice</trigger>

<parameters>
<param name="structuralElements" lang="English" required="true">
IF PHOTO: Describe visible structure (e.g., "arched window on left wall, wooden ceiling beams, parquet floor")
IF NO PHOTO: Describe requested structure from conversation
</param>

<param name="roomType" lang="English" required="true">
Specific room type (e.g., "living room", "kitchen", "bathroom")
</param>

<param name="style" lang="English" required="true">
Design style (e.g., "modern", "industrial", "scandinavian")
</param>

<param name="prompt" required="true">
MUST start with structuralElements description, then add style and material details.
</param>

<param name="mode" required="true">
- "modification" IF conversation history contains `[Immagine allegata: URL]`
  → Extract URL and populate sourceImageUrl
- "creation" IF no image marker found
</param>

<param name="sourceImageUrl" conditional="true">
Required when mode="modification"
Extract from marker: [Immagine allegata: https://storage.googleapis.com/...]
Use ONLY the URL part (between ":" and "]")
</param>

<param name="keepElements" type="array" lang="English">
CRITICAL: List everything user wants to PRESERVE.
Examples:
- "Tieni il camino" → ["fireplace"]
- "Mantieni pavimento e scale" → ["floor", "staircase"]
- "Cambia tutto" → []

MATERIAL FIDELITY RULE:
If keeping an element, respect its ORIGINAL material/color in descriptions.
DO NOT assume new style materials for preserved elements.
</param>
</parameters>

<workflow>
PHASE 1: PRESERVATION ANALYSIS (for I2I mode)
1. Acknowledge uploaded image
2. Ask: "Quali elementi della foto vuoi MANTENERE invariati?"
3. WAIT for answer

PHASE 2: DESIGN DETAILS (for new elements)
Ask ONLY for elements NOT preserved:
- IF walls not preserved: "Che colore vuoi per le pareti?"
- IF floor not preserved: "Che tipo di pavimento immagini?"
- ALWAYS ask: "Che stile di arredamento preferisci?"

PHASE 3: EXECUTION
Call generate_render with all gathered parameters.

⚠️ POST-EXECUTION CRITICAL:
When generate_render returns, your response MUST include the EXACT image markdown from the tool output.
The tool returns: "![Design](https://storage...)"
You MUST copy this EXACTLY into your response. Do NOT paraphrase or summarize.
Example response: "Ecco il tuo rendering! ![Design](https://...) Ti piace?"
</workflow>
</tool>"""

TOOL_SUBMIT_LEAD = """<tool name="submit_lead_data">
<trigger>User wants "quote", "cost", "preventivo", "renovation details"</trigger>

<goal>
Gather 4 PILLARS before calling tool.
Minimum 8-10 exchanges for quality information.
</goal>

<pillars>
<pillar name="project_vision">
- What do they want to achieve?
- Which room/space?
- Current state vs desired outcome
- Style preferences
</pillar>

<pillar name="scope_of_work">
- What needs to be done? (demolition, construction, finishes)
- Systems involved? (electrical, plumbing, HVAC)
- Materials preferences
- Demolition extent
</pillar>

<pillar name="context_metrics">
- Room type and approximate dimensions (accept "circa 20mq", "piccolo/medio/grande")
- Structural constraints (load-bearing walls, windows, doors)
- For kitchens: Linear meters of cabinets
- For bathrooms: Wall tile coverage area
- For flooring: Square meters to cover
</pillar>

<pillar name="contact_info">
ASK LAST, before saving:
- Nome/Name
- Email
- Telefono/Phone
</pillar>
</pillars>

<approach>
START: "Ciao! Raccontami del tuo progetto. Cosa vorresti realizzare?"

MIDDLE: Open-ended questions → Intelligent follow-ups
- Ask WHAT they want (vision), not HOW (logistics)
- Request measurements naturally, accept approximations
- Adapt to their answers (be contextual)
- Focus on SCOPE, MATERIALS, DIMENSIONS

END: Confirm + Contact Info + Save
"Perfetto! Per inviarti il preventivo, a chi posso intestarlo? Nome, Email e Telefono."
</approach>

<output_format>
Compile rich narrative in projectDetails:
"Ristrutturazione cucina 20mq, stile moderno. Demolizione parziale con 
mantenimento disposizione attuale. Top in quarzo, ante laccate bianche, 
pavimento in gres effetto cemento. Elettrodomestici da includere..."
</output_format>

<good_questions>
✅ "Raccontami del tuo progetto: cosa vuoi realizzare?"
✅ "Che dimensioni ha lo spazio? Anche indicative vanno bene"
✅ "Quali materiali hai in mente? (Legno, marmo, gres...)"
✅ "Gli impianti vanno rifatti o aggiornati?"
</good_questions>

<bad_questions>
❌ "A che piano è l'appartamento?" (irrelevant)
❌ "Qual è il tuo budget massimo?" (premature)
❌ "Compilare campo numero 7..." (too bureaucratic)
</bad_questions>
</tool>"""

TOOL_PRICE_SEARCH = """<tool name="price_search">
<trigger>User asks for specific market prices</trigger>

<rules>
1. Search Italian market 2025-2026 **for Rome/Lazio region** (default)
2. FORMAT STRICT LIMIT (Max 5 lines total):
   * **[Fornitore]:** €[Min]-€[Max] /[unità]
3. NO intros, NO outros, NO explanations
4. Just pure data
5. **REGION CONTEXT**: Use Roma/Lazio labor and material costs as baseline

Example Query to Perplexity:
"Prezzi attuali 2025-2026 per [materiale/lavoro] nella regione Lazio (Roma)"

Example Output:
* **Leroy Merlin:** €18-€35 /mq
* **Iperceramica:** €22-€50 /mq
* **Bricoman:** €15-€28 /mq
</rules>
</tool>"""


TOOL_ANALYZE_ROOM = """<tool name="analyze_room">
<trigger>User uploads an image OR wants "technical analysis", "room dimensions", "list of features"</trigger>

<goal>
Extract technical data from the image to populate the "Technical Surveyor" context.
</goal>

<parameters>
<param name="image_url" required="true">
The URL of the user's uploaded image.
</param>
</parameters>

<workflow>
1. DETECT image upload.
2. IMMEDIATELY call `analyze_room(image_url="...")`. Do not ask for permission.
3. WAIT for the tool result (JSON with room details).
4. SYNTHESIZE the result into a friendly confirmation:
   "Ho analizzato la foto! Vedo un [room_type] di circa [mq]mq con [details]. Confermi?"
</workflow>
</tool>"""

TOOL_SAVE_QUOTE = """<tool name="save_quote">
<trigger>When surveyor interview is complete ("Technical Surveyor" mode)</trigger>
<goal>Save the structured draft quote to the database.</goal>
<parameters>
<param name="user_id" required="true">Current user ID.</param>
<param name="ai_data" required="true">
JSON object containing the 4 pillars gathered:
{ "vision": "...", "scope": "...", "metrics": "...", "contact": "..." }
</param>
</parameters>
</tool>"""

TOOL_PLAN_RENOVATION = """<tool name="plan_renovation">
<trigger>User asks for a "plan", "layout proposal", or "architectural advice" WITHOUT a render request.</trigger>
<goal>Generate a text-based architectural plan/strategy.</goal>
<parameters>
<param name="image_url" conditional="true">Image URL if available.</param>
<param name="style" required="true">Desired style.</param>
<param name="keepElements" type="array">Elements to preserve.</param>
</parameters>
</tool>"""

# Combined export
TOOLS = f"{TOOL_GENERATE_RENDER}\n\n{TOOL_SUBMIT_LEAD}\n\n{TOOL_PRICE_SEARCH}\n\n{TOOL_ANALYZE_ROOM}\n\n{TOOL_SAVE_QUOTE}\n\n{TOOL_PLAN_RENOVATION}"
