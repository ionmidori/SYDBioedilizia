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
1. Search Italian market 2025-2026
2. FORMAT STRICT LIMIT (Max 5 lines total):
   * **[Fornitore]:** €[Min]-€[Max] /[unità]
3. NO intros, NO outros, NO explanations
4. Just pure data

Example:
* **Leroy Merlin:** €18-€35 /mq
* **Iperceramica:** €22-€50 /mq
* **Bricoman:** €15-€28 /mq
</rules>
</tool>"""

# Combined export
TOOLS = f"{TOOL_GENERATE_RENDER}\n\n{TOOL_SUBMIT_LEAD}\n\n{TOOL_PRICE_SEARCH}"
