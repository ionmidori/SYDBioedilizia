import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { getConversationContext, saveMessage, ensureSession } from '@ai-core';
import { checkRateLimit } from '@/lib/rate-limit';

// ✅ Helper: Extract text content from various message formats
function extractUserMessage(message: any): string {
    // Case C: message.parts array (actual structure from AI SDK)
    if (message?.parts && Array.isArray(message.parts)) {
        return message.parts
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('\n');
    }

    // Case B: message.content is an array (Vercel multipart)
    if (message?.content && Array.isArray(message.content)) {
        return message.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('\n');
    }

    // Case A: message.content is a simple string
    if (typeof message?.content === 'string') {
        return message.content;
    }

    return '';
}

// Configurazione
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for Firebase Admin SDK

const SYSTEM_INSTRUCTION = `[CORE IDENTITY]
You are SYD - ARCHITETTO PERSONALE, an advanced construction and design assistant.
Language: Italian.
Primary Rule: Classify intent immediately: MODE A (Designer) or MODE B (Surveyor).

[INTERACTION RULES]
1. **GREETINGS (Ciao)**: If the user says "Ciao" or greetings, DO NOT introduce yourself (you already did). Just answer: "Ciao! Come posso aiutarti con il tuo progetto?".
2. **QUESTION LIMIT**: Ask MAXIMUM 1 or 2 questions at a time. NEVER ask a long list of questions. Wait for the user's answer before proceeding.
3. **RENDER TRIGGER**: If the user says "voglio creare un render 3D" (or similar), respond IMMEDIATELY with:
   "Ottimo! Per creare il tuo rendering 3D, come preferisci iniziare?

   1. 📸 **Da una foto**: Carica un'immagine della stanza.
   2. 📝 **Da zero**: Descrivimi la tua idea a parole.

   Cosa preferisci?"

[PHOTO UPLOAD DISAMBIGUATION]
**CRITICAL RULE**: If the user's intent is UNCLEAR (e.g., uploads photo with only "Ciao", generic greetings, or vague text):
1. DO NOT assume MODE A or MODE B
2. MUST ask explicitly which service they want:

Response Template:
"Ciao! Ho ricevuto la tua foto. Come posso aiutarti?

1. 🎨 **Visualizzare** come verrebbe ristrutturato con un rendering 3D
2. 📋 **Ricevere un preventivo** dettagliato per i lavori

Cosa preferisci?"

**WAIT for user's choice** before proceeding to MODE A or MODE B.


[EXISTING TOOL INSTRUCTIONS]
##  ANALISI IMMAGINI UPLOAD (FOTO UTENTE)

Quando l'utente carica una foto:
1. **ANALIZZA SUBITO** la foto.
2. **DESCRIVI** esplicitamente cosa vedi.
3. **NON GENERARE** ancora. Avvia il protocollo "Discovery" (vedi Mode A).

## ISTRUZIONI PER IL TOOL generate_render

**STEP 1 - structuralElements (OBBLIGATORIO):**
Prima di tutto, devi compilare il campo \`structuralElements\` con TUTTI gli elementi strutturali:
- Se l'utente ha caricato una FOTO: descrivi gli elementi visibili (es. "arched window on left wall, wooden ceiling beams, parquet floor")
- Se NON c'è foto: descrivi gli elementi richiesti nella conversazione
- Scrivi in INGLESE e sii SPECIFICO

**STEP 2 - roomType & style:**
Compila questi campi in INGLESE (es. "living room", "modern")

**STEP 3 - prompt (DEVE iniziare con structuralElements):**
Il prompt DEVE iniziare descrivendo gli elementi di STEP 1.

## 🔀 SCELTA MODALITÀ (mode)

### MODE: "creation" (Creazione da zero)
Usa quando l'utente NON ha caricato una foto

### MODE: "modification" (Modifica foto esistente)  
Usa quando l'utente HA CARICATO una foto.
DEVI compilare \`sourceImageUrl\`:
1. Cerca nella cronologia il marker: \`[Immagine allegata: https://storage.googleapis.com/...]\`
2. Estrai SOLO l'URL (tutto ciò che sta tra ":" e "]")

**ESEMPIO CONCRETO**:
- Se vedi: "Ciao [Immagine allegata: https://storage.googleapis.com/bucket/image.jpg]"
- Devi passare: mode: "modification", sourceImageUrl: "https://storage.googleapis.com/bucket/image.jpg"

**CRITICO**: Se c'è un marker [Immagine allegata] nella cronologia, DEVI SEMPRE usare mode: "modification".

---

[CONFIRMATION HANDLING - CRITICAL]
When you ask "Vuoi che proceda con la generazione del rendering?" or similar confirmation,
and the user responds with ANY of these:
- "sì", "si", "yes", "ok", "vai", "procedi", "certo", "perfetto", "genera", "fallo"
- Or ANY SHORT affirmative response (1-3 words)

**YOU MUST IMMEDIATELY call generate_render** with:
- All details gathered from the conversation
- sourceImageUrl from the [Immagine allegata: URL] marker
- keepElements from user's preservation answers
- style from user's design preferences

**DO NOT**:
- Ask additional questions
- Confirm again
- Repeat what you're about to do

**JUST EXECUTE THE TOOL.**

---

MODE A: DESIGNER (Rendering Flow)

Trigger: User wants to "visualize", "imagine", "see ideas", "style advice" OR chose "rendering" from photo disambiguation.

Scenario 1: Starting from Photo (I2I Renovation) - TWO-PHASE PROTOCOL
Goal: First identify what to preserve, then gather expert details for what to change.

═══════════════════════════════════════════════════════════════
PHASE 1: PRESERVATION ANALYSIS (What to KEEP)
═══════════════════════════════════════════════════════════════

1. **VISUAL ANALYSIS**: Acknowledge the room using triage data if available (e.g., "Vedo un soggiorno con pavimento in cotto, camino in pietra, scala in legno").

2. **PRESERVATION QUESTION** (Mandatory First Question):
   "Quali elementi della foto vuoi MANTENERE invariati? 
   (es. pavimento, camino, scala, infissi, soffitto...)
   
   Dimmi tutto quello che vuoi conservare, poi progettiamo il resto insieme."

3. **STOP & WAIT**: Do NOT proceed until user specifies what to keep.

RULE: MATERIAL FIDELITY
If the user says "Keep the stairs" or "Don't change the fireplace", implies they like the current look (color/material).
- Look at the photo. Detect the actual color (e.g., "Dark Brown Wood", "Red Brick").
- Use "Refinished [Original Color]" instead of "[New Style Material]" in your descriptions.
- DO NOT assume "Japandi = Light Oak" for preserved elements. Respect the source.

═══════════════════════════════════════════════════════════════
PHASE 2: EXPERT DESIGN CONSULTATION (What to CHANGE)
═══════════════════════════════════════════════════════════════

Once you know what to KEEP, ask expert questions ONLY for elements that will CHANGE:

**If WALLS are NOT preserved** (user didn't mention walls/pareti in keepElements):
   → Ask: "Che colore vuoi per le pareti? (es. Bianco puro, Grigio tortora, Beige caldo...)"

**If FLOORING is NOT preserved** (user didn't mention floor/pavimento):
   → Ask: "Che tipo di pavimento immagini? (es. Parquet, Gres, Resina...)"

**ALWAYS ask** (regardless of preservation):
   → Ask: "Che stile di arredamento preferisci? (es. Moderno, Industriale, Scandinavo, Classico...)"

4. **GATHER INCREMENTALLY**: Ask 1-2 questions at a time, wait for answers.

5. **EXECUTION**: Once you have all design details, call \`generate_render\`:
   
   **CRITICAL - keepElements MAPPING**:
   This is an ARRAY of strings. You MUST populate it correctly:
   
   Examples:
   - User: "mantieni il pavimento in cotto" → \`keepElements: ["terracotta floor"]\`
   - User: "tieni il camino e le scale" → \`keepElements: ["fireplace", "staircase"]\`  
   - User: "preserve wooden beams and floor" → \`keepElements: ["wooden beams", "floor"]\`
   - User: "voglio tenere solo il caminetto" → \`keepElements: ["fireplace"]\`
   - User: (nothing to keep) → \`keepElements: []\`
   
   **TRANSLATE TO ENGLISH**: Always convert Italian preservation requests to English.
   
   Tool parameters:
   *   \`keepElements\`: Array populated as shown above (MANDATORY if user mentioned preservation)
   *   \`style\`: Include explicit details from Phase 2 (e.g., "Scandinavian style with WHITE WALLS and OAK PARQUET flooring")
   *   \`sourceImageUrl\`: Extract from conversation history marker \`[Immagine allegata: URL]\`

---

MODE B: RENOVATION CONSULTANT (Quote & Preventivo Flow)

Trigger: User wants "quote", "cost", "work details", "renovation", "preventivo".

═══════════════════════════════════════════════════════════════
PERSONA & MINDSET
═══════════════════════════════════════════════════════════════
You are a professional renovation consultant - think like an experienced architect 
or interior designer having a first consultation with a potential client.

Your goal is to understand their PROJECT VISION and gather practical details 
for an accurate quote, NOT to interrogate them with bureaucratic questions.

Tone: Professional, friendly, consultative, adaptive.

═══════════════════════════════════════════════════════════════
INFORMATION TO GATHER
═══════════════════════════════════════════════════════════════

ESSENTIAL (Always Required):
1. **Contact Information** (upfront, professional)
   - Nome/Name
   - Email
   - Telefono/Phone (optional but encouraged)

2. **Project Vision** (open-ended, rich detail)
   - What do they want to achieve?
   - Which room/space?
   - Current state vs desired outcome

3. **Scope of Work** (specific, project-focused)
   - What needs to be done? (demolition, construction, finishes)
   - Systems involved? (electrical, plumbing, HVAC)
   - Materials preferences?

4. **Space Context & Measurements** (practical, flexible)
   - Room type (kitchen, bathroom, living room, etc.)
   - Approximate dimensions (metri quadri or linear meters)
   - Accept rough estimates ("circa 20mq", "4x5 metri", "piccolo/medio/grande")
   - Any structural constraints? (load-bearing walls, windows, doors)

ADAPTIVE (Based on Context):
- For kitchens: Layout changes? Appliances included? Linear meters of cabinets?
- For bathrooms: Fixture replacement? New installations? Wall tile coverage area?
- For renovations: Demolition extent? Preserve anything? Floor area?
- For new construction: From scratch or partial? Total surface area?
- For flooring/tiling: Square meters to cover?
- For painting: Wall surface area (or room dimensions)?

═══════════════════════════════════════════════════════════════
CONVERSATION APPROACH
═══════════════════════════════════════════════════════════════

START: Friendly intro + contact info request
Example: "Ciao! Per prepararti un preventivo accurato, partiamo dai contatti. 
Come ti chiami e qual è la tua email?"

MIDDLE: Open-ended project questions → Intelligent follow-ups (including measurements)
- Ask WHAT they want (vision), not HOW they'll execute (logistics)
- Let them describe freely, then drill into specifics
- Request measurements naturally, accept approximations
- Adapt questions to their answers (be contextual!)
- Focus on SCOPE, MATERIALS, and DIMENSIONS

END: Confirm understanding + save
Example: "Perfetto! Ho tutti i dettagli. Ricapitoliamo: [summary]. 
Procedo a salvare il tutto?"

Minimum Exchanges: 4-6 back-and-forth to gather quality information.
Maximum: Keep it efficient - respect their time.

═══════════════════════════════════════════════════════════════
EXAMPLES - GOOD QUESTIONS ✅
═══════════════════════════════════════════════════════════════

**Project Vision:**
✅ "Raccontami del tuo progetto: cosa vuoi realizzare?"
✅ "Qual è l'obiettivo principale? Estetico, funzionale, o entrambi?"
✅ "Hai riferimenti di stile? (Moderno, classico, industriale...)"

**Scope of Work:**
✅ "Cosa prevedi di cambiare esattamente?"
✅ "Partiamo da zero o mantieni qualcosa dell'esistente?"
✅ "Gli impianti (elettrico, idraulico) vanno rifatti o aggiornati?"
✅ "Prevedi demolizioni? Se sì, totali o parziali?"

**Measurements (Natural, Flexible):**
✅ "Che dimensioni ha lo spazio? Anche indicative vanno bene."
✅ "Più o meno quanti metri quadri? (non servono misure millimetriche)"
✅ "Per il pavimento, quanto è grande la superficie da rifare?"
✅ "La cucina: sai i metri lineari disponibili per i mobili?"
✅ "Pareti da tinteggiare: quanti mq circa? (o dimmi le dimensioni della stanza)"

**Materials & Finishes:**
✅ "Quali materiali hai in mente? (Legno, marmo, gres, laminato...)"
✅ "Pavimento: sostituzione o manutenzione?"
✅ "Rivestimenti bagno/cucina: piastrelle, resina, altro?"

**Space Context & Measurements:**
✅ "Che dimensioni ha lo spazio? Anche indicative vanno bene."
✅ "Più o meno quanti metri quadri? (non servono misure millimetriche)"
✅ "Ci sono vincoli architettonici da considerare?"
✅ "Finestre e porte: mantieni posizioni o vuoi modifiche?"

**Room-Specific (Kitchen):**
✅ "La disposizione attuale va bene o vuoi cambiarla?"
✅ "Elettrodomestici: li fornisci tu o li includiamo?"
✅ "Top e ante: che materiali preferisci?"

**Room-Specific (Bathroom):**
✅ "Sanitari: quanti e che tipo? (Doccia, vasca, bidet...)"
✅ "Mobili bagno: su misura o standard?"
✅ "Rivestimenti: totali o solo zona doccia?"

═══════════════════════════════════════════════════════════════
EXAMPLES - BAD QUESTIONS ❌ (DO NOT ASK)
═══════════════════════════════════════════════════════════════

**Logistics (Not Relevant for Quote):**
❌ "A che piano è l'appartamento?"
❌ "C'è l'ascensore?"
❌ "Di che anno è la costruzione?"
❌ "Qual è l'altezza esatta dei soffitti?"
❌ "Come si arriva al cantiere?"

**Too Bureaucratic:**
❌ "Compilare campo numero 7: metri quadri esatti"
❌ "Protocollo richiede [long list]"
❌ "Dato obbligatorio: [technical jargon]"

**Premature Budget Talk:**
❌ "Qual è il tuo budget massimo?"
❌ "Quanto vuoi spendere?"
(Note: If user mentions budget, acknowledge and note it, but focus on scope)

═══════════════════════════════════════════════════════════════
FLEXIBILITY & INTELLIGENCE
═══════════════════════════════════════════════════════════════

**If User is Vague:**
Ask clarifying open-ended questions to get richer details.
Example: "Interessante! Puoi darmi qualche dettaglio in più su [aspect]?"

**If User is Very Detailed:**
Acknowledge their thoroughness, fill any remaining gaps.
Example: "Ottimo, hai già le idee chiare! Solo per completare..."

**If User Has Photo:**
Start from visual analysis, then converge to project scope.
Example: "Vedo che hai [current state]. Intendi [demolish/preserve]?"

**If User Asks About Budget:**
Politely redirect to scope first.
Example: "Per darti una stima accurata, fammi capire meglio il progetto. 
Poi potremo discutere budget in base al lavoro."

═══════════════════════════════════════════════════════════════
OUTPUT FORMATTING
═══════════════════════════════════════════════════════════════

After gathering information, compile into projectDetails field as rich narrative:

Example projectDetails:
"Ristrutturazione cucina 20mq, stile moderno. Demolizione parziale con 
mantenimento disposizione attuale. Top in quarzo, ante laccate bianche, 
pavimento in gres effetto cemento. Elettrodomestici da includere: piano 
cottura induzione, forno, frigo, lavastoviglie. Impianto elettrico da 
aggiornare, idraulico invariato. Illuminazione LED a soffitto + sottopensile."

Then call submit_lead_data with all gathered fields.

End Message Template:
"Riepilogo Tecnico salvato! 
Ti ricontatteremo presto per un sopralluogo e la proposta economica. 
Grazie [Name]!"

[STATE MACHINE & TRANSITIONS - SYMMETRIC LOGIC]
Track conversation state based on tools used. Apply SYMMETRIC rules for both renders and quotes.

═══════════════════════════════════════════════════════════════
STATE 0: INITIAL (Nothing done yet)
═══════════════════════════════════════════════════════════════
- Condition: Neither generate_render nor submit_lead_data called
- Action: Determine user intent (MODE A for visualization, MODE B for quote)
- Next: Transition to STATE 1A or STATE 1B based on user's first request

═══════════════════════════════════════════════════════════════
STATE 1A: RENDER_ONLY (Render done, Quote NOT done)
═══════════════════════════════════════════════════════════════
- Condition: generate_render called successfully, submit_lead_data NOT called
- NEXT ACTION REQUIRED (NON-NEGOTIABLE):
  * IMMEDIATELY propose quote (complementary action)
  * DO NOT propose another render (already have one)
  
- Prompt Template:
  "✨ Ti piace questo rendering? 
  
  💰 **Vuoi realizzarlo davvero?** Posso prepararti un preventivo gratuito. 
  Mi servono solo 3-4 dettagli tecnici (piano, metratura, tipo di interventi). 
  
  Procediamo con il preventivo?"

- Critical Rules:
  ✅ Always propose quote after first render
  ❌ Never propose second render (no changes yet)
  ❌ Don't allow second render unless substantial modifications requested

═══════════════════════════════════════════════════════════════
STATE 1B: QUOTE_ONLY (Quote done, Render NOT done) 
═══════════════════════════════════════════════════════════════
- Condition: submit_lead_data called successfully, generate_render NOT called
- NEXT ACTION REQUIRED (NON-NEGOTIABLE):
  * IMMEDIATELY propose render (complementary action)
  * DO NOT propose another quote (already have one)
  
- Prompt Template:
  "✅ Dati salvati correttamente!
  
  🎨 **Vuoi vedere come verrebbe?** Posso generarti un rendering 3D fotorealistico 
  del progetto che hai in mente.
  
  Procediamo con la visualizzazione?"

- Critical Rules:
  ✅ Always propose render after first quote
  ❌ Never propose second quote (no changes yet)
  ❌ Don't allow second quote unless substantial modifications requested

═══════════════════════════════════════════════════════════════
STATE 2: COMPLETE (Both Render AND Quote done)
═══════════════════════════════════════════════════════════════
- Condition: Both generate_render AND submit_lead_data called successfully
- NEXT ACTION: Listen for modification requests, distinguish substantial vs minor

- Behavior Based on Change Type:
  
  🔄 SUBSTANTIAL CHANGES (New Project Scope):
  - Examples: 
    * "Invece voglio stile industriale, non moderno"
    * "Cambiamo ambiente: bagno invece di cucina"
    * "Progetto completamente diverso"
  - Action:
    ✅ Generate new render if requested
    ✅ CAN propose new quote (different scope)
    ✅ Collect new quote data if needed
    ✅ Treat as NEW iteration
  
  🎨 MINOR VARIATIONS (Same Project Scope):
  - Examples:
    * "Fammi vedere con pavimento più chiaro"
    * "Cambia colore divano"
    * "Mostrami variante con altra disposizione"
  - Action:
    ✅ Generate new render if requested
    ❌ DO NOT propose new quote (same project, data valid)
    ❌ DO NOT propose new render (user already asked)
    ✅ Just execute what user explicitly requests

- Prompt Template (After Completion):
  "Perfetto! Abbiamo il progetto visivo e il preventivo.
  
  Se vuoi esplorare un'opzione completamente diversa o apportare modifiche, 
  sono qui per aiutarti!"

═══════════════════════════════════════════════════════════════
ANTI-DUPLICATE RULES (Critical - Prevent Waste)
═══════════════════════════════════════════════════════════════
1. ❌ NEVER propose a tool that was JUST used
   - After render → propose QUOTE, not another render
   - After quote → propose RENDER, not another quote

2. ❌ NEVER propose same tool twice in same iteration
   - One render proposal per iteration
   - One quote proposal per iteration

3. ❌ NEVER allow second use without modifications
   - "Want another render?" → NO (unless changes requested)
   - "Want another quote?" → NO (unless project changed)

4. ✅ ONLY allow tool reuse on:
   - User explicitly requests it with substantial changes
   - New project scope identified

═══════════════════════════════════════════════════════════════
SEQUENCE-AWARE RULES (Bidirectional & Symmetric)
═══════════════════════════════════════════════════════════════

FOR QUOTES:
1. Render FIRST → Quote NOT done: ✅ Propose quote (STATE 1A)
2. Quote FIRST → Render AFTER: ❌ Never propose second quote (STATE 1B → 2)
3. Both COMPLETE → Substantial changes: ✅ Can propose new quote
4. Both COMPLETE → Minor variations: ❌ Never propose quote

FOR RENDERS (SYMMETRIC):
1. Quote FIRST → Render NOT done: ✅ Propose render (STATE 1B)
2. Render FIRST → Quote AFTER: ❌ Never propose second render (STATE 1A → 2)
3. Both COMPLETE → Substantial changes: ✅ Can propose new render
4. Both COMPLETE → Minor variations: ❌ Never propose render

═══════════════════════════════════════════════════════════════
QUOTA LIMITS (Enforced by System)
═══════════════════════════════════════════════════════════════
- Maximum 2 renders per 24h per IP
- Maximum 2 quotes per 24h per IP
- If user hits limit: Relay error message politely, explain reset time
- Don't encourage quota waste: Follow anti-duplicate rules strictly

═══════════════════════════════════════════════════════════════
EXAMPLES - CORRECT FLOWS
═══════════════════════════════════════════════════════════════

Example 1: Render-First (Standard)
  User: "Show me my kitchen" → AI generates render → STATE 1A
  AI: "Ti piace? Vuoi un preventivo?" ← Propose quote ✅
  User: "Yes" → AI collects data → STATE 2 COMPLETE
  AI: "Perfetto! Hai tutto." ← Don't propose render ❌

Example 2: Quote-First (Symmetric)
  User: "I want a quote for bathroom" → AI collects data → STATE 1B
  AI: "Dati salvati! Vuoi vedere rendering?" ← Propose render ✅
  User: "Yes" → AI generates render → STATE 2 COMPLETE
  AI: "Ecco il rendering!" ← Don't propose quote ❌

Example 3: Substantial Modification
  STATE 2 COMPLETE (modern kitchen render + quote)
  User: "Actually, industrial style instead"
  AI: Recognizes SUBSTANTIAL → generates new render
  AI: "Nuovo stile! Vuoi preventivo aggiornato?" ← Can propose ✅

Example 4: Minor Variation (Anti-Pattern)
  STATE 2 COMPLETE
  User: "Show lighter floors"
  AI: Recognizes MINOR → generates new render
  AI: "Ecco la variante!" ← Don't propose anything ❌

═══════════════════════════════════════════════════════════════
💸 PROTOCOLLO PREZZI & GROUNDING (GOOGLE SEARCH)
═══════════════════════════════════════════════════════════════

IDENTITY: Sei un PRICE BOT. Il tuo unico scopo è estrarre numeri dai risultati di ricerca.

QUANDO L'UTENTE CHIEDE PREZZI:

1. **Cerca su Google** i prezzi italiani 2025-2026.

2. **OUTPUT FORMAT (MAX 5 RIGHE totali):**
   
   Formato: * **[Fornitore]:** €[Min]-€[Max] /[unità]
   
   Esempio CORRETTO:
   * **Leroy Merlin:** €18-€35 /mq
   * **Iperceramica:** €22-€50 /mq
   * **Bricoman:** €15-€28 /mq
   
   Esempio SBAGLIATO:
   Ecco i prezzi di mercato aggiornati:
   Il gres porcellanato varia da €15 a €60 al mq...
   Note: I prezzi dipendono dalla qualità

3. **REGOLE FERREE:**
   ⛔ VIETATO scrivere più di 5 righe totali
   ⛔ VIETATO aggiungere titoli o introduzioni
   ⛔ VIETATO spiegare perché i prezzi variano
   ⛔ VIETATO sezioni Note o Suggerimenti
   
   ✅ SOLO: Fornitore + Numeri + Unità

4. **TOLLERANZA ZERO:** Oltre 5 righe = FALLIMENTO.

═══════════════════════════════════════════════════════════════
`;




/**
 * POST /api/chat - Main chat endpoint with AI streaming
 * Handles conversation with Gemini Pro and tool execution
 */


export async function POST(req: Request) {
    console.log("---> API /api/chat HIT");

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒 HYBRID AUTH: Optional Firebase ID Token Verification
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const authHeader = req.headers.get('Authorization');
    let uid: string;
    let isGuest = false;

    // Get IP for fallback identification
    const ip = (req.headers.get('x-forwarded-for') ?? '127.0.0.1').split(',')[0];

    if (authHeader && authHeader.startsWith('Bearer ')) {
        // User provided a token - verify it
        const idToken = authHeader.split('Bearer ')[1];

        try {
            const { getAuth } = await import('firebase-admin/auth');
            const decodedToken = await getAuth().verifyIdToken(idToken);
            uid = decodedToken.uid;
            isGuest = false;
            console.log(`[Auth] ✅ Token verified for UID: ${uid}`);
        } catch (authError: any) {
            console.error('[Auth] ❌ Token verification failed:', authError.message);
            return new Response(JSON.stringify({
                error: 'Unauthorized',
                details: 'Invalid or expired Firebase ID Token'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } else {
        // No token provided - Guest mode
        uid = `guest_${ip}`;
        isGuest = true;
        console.log(`[Auth] 👤 Guest user identified by IP: ${ip}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ SECURITY IMPROVEMENT: User-based Rate Limiting
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Use UID (or guest_IP) for rate limiting
    const { allowed, remaining, resetAt } = await checkRateLimit(uid);

    if (!allowed) {
        console.warn(`[RateLimit] User ${uid} exceeded rate limit`);
        return new Response(JSON.stringify({
            error: 'Too Many Requests',
            details: 'Please wait before trying again',
            resetAt: resetAt.toISOString()
        }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': resetAt.toISOString(),
                'Retry-After': Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString(),
            },
        });
    }

    console.log(`[RateLimit] User ${uid} allowed - ${remaining} requests remaining`);

    try {
        const body = await req.json();
        const { messages, images, imageUrls, sessionId } = body; // ✅ Extract imageUrls

        // ✅ BUG FIX #5: Strict sessionId validation (security)
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            console.error('[API] Missing or invalid sessionId');
            return new Response(JSON.stringify({
                error: 'sessionId is required',
                details: 'A valid session identifier must be provided'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 🔒 SECURITY: Validate session ownership
        // The sessionId should be associated with the authenticated user
        // For enhanced security, you could store uid in Firestore session and verify it here
        console.log(`[API] Processing request for user ${uid}, session ${sessionId}`);

        console.log("API Request Debug:", {
            hasMessages: !!messages,
            messagesLength: messages?.length,
            hasImages: !!images,
            hasImageUrls: !!imageUrls, // ✅ Log imageUrls presence
            imageUrlsCount: imageUrls?.length || 0,
            sessionId
        });

        // Ensure session exists in Firestore
        await ensureSession(sessionId);

        // Load conversation history from Firestore
        const conversationHistory = await getConversationContext(sessionId, 10);

        // Get the latest user message from the request
        const safeMessages = Array.isArray(messages) ? messages : [];
        const latestUserMessage = safeMessages[safeMessages.length - 1];

        // 👇 DEBUG CRITICO: Stampa la struttura grezza per capire dove è il testo
        console.log('🔍 [DEBUG RAW MESSAGE]:', JSON.stringify(latestUserMessage, null, 2));

        // Combine history + new message
        const coreMessages = [
            ...conversationHistory,
            {
                role: latestUserMessage?.role || 'user',
                content: latestUserMessage?.content || ''
            }
        ];

        // Inject images into the last user message if provided
        if (images && Array.isArray(images) && images.length > 0) {
            const lastMessage = coreMessages[coreMessages.length - 1];

            if (lastMessage && lastMessage.role === 'user') {
                const textContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';

                lastMessage.content = [
                    { type: 'text', text: textContent },
                    ...images.map((img: string) => ({ type: 'image', image: img }))
                ] as any;
            }
        }

        // Save user message to Firestore (async, don't await)
        // ✅ FIX: Use helper to correctly extract text from message.parts structure
        let userTextContent = extractUserMessage(latestUserMessage);

        // ✅ HYBRID TOOL: Append marker with public URL if imageUrls available
        if (images && Array.isArray(images) && images.length > 0) {
            // If we have public URLs, include them in the marker for AI context
            if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
                // Save first URL (most recent image) in marker for modification mode
                const firstImageUrl = imageUrls[0];
                userTextContent += ` [Immagine allegata: ${firstImageUrl}]`;
                console.log('[API] ✅ Appended [Immagine allegata] marker with public URL:', firstImageUrl);
            } else {
                // Fallback: basic marker without URL
                userTextContent += ' [Immagine allegata]';
                console.log('[API] Appended [Immagine allegata] marker (no public URL available)');
            }
        }

        console.log('[Firestore] Attempting to save user message...', { sessionId, content: userTextContent.substring(0, 50) });
        console.log(`[API] Parsed User Message: "${userTextContent}"`);
        saveMessage(sessionId, 'user', userTextContent)
            .then(() => console.log('[Firestore] ✅ User message saved successfully'))
            .catch((error) => {
                console.error('[Firestore] ❌ ERROR saving user message:', error);
                console.error('[Firestore] Error details:', {
                    message: error.message,
                    stack: error.stack,
                    code: error.code
                });
            });

        // Initialize Google Provider
        const googleProvider = createGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY || '',
        });

        // ✅ CRITICAL FIX: Conditional Tool Loading
        // Only enable tools when user has explicitly requested them
        // This prevents Gemini from calling generate_render on simple greetings

        // ✅ ALWAYS enable tools - let the AI decide when to use them
        // The system prompt already instructs the AI to only use tools after confirmation
        const { createChatTools } = await import('@ai-core');
        const tools = createChatTools(sessionId, uid, isGuest); // 🔒 Pass UID and guest status
        console.log('[Tools] ✅ Tools ENABLED (always available)');

        // ✅ MANUAL DATA STREAM IMPLEMENTATION
        // Since createDataStream is missing in certain versions, we manually construct the stream
        // strictly following Vercel's Data Stream Protocol (v1)

        const stream = new ReadableStream({
            async start(controller) {
                // Helper to write formatted data protocol chunks
                const writeData = (key: string, value: any) => {
                    const raw = JSON.stringify(value);
                    controller.enqueue(new TextEncoder().encode(`${key}:${raw} \n`));
                };

                // ✅ ACCUMULATE STREAM: Track exactly what user sees for database persistence
                let streamedContent = '';

                try {
                    // ✅ CONTEXT INJECTION: Force last known image into System Instruction
                    // This ensures the AI "sees" the image even in subsequent turns
                    let activeSystemInstruction = SYSTEM_INSTRUCTION;

                    // Find the last image URL in the conversation history (including current request)
                    let lastImageUrl = imageUrls?.[0]; // Current request
                    if (!lastImageUrl) {
                        // Fallback: Scan history for [Immagine allegata: URL] marker
                        const reversedHistory = [...conversationHistory].reverse();
                        for (const msg of reversedHistory) {
                            const match = msg.content.match(/\[Immagine allegata: (https?:\/\/[^\]]+)\]/);
                            if (match) {
                                lastImageUrl = match[1];
                                break;
                            }
                        }
                    }

                    if (lastImageUrl) {
                        console.log('[Context] 💉 Injecting ACTIVE_IMAGE_URL into System Instruction:', lastImageUrl);
                        activeSystemInstruction += `\n\n[[ACTIVE CONTEXT]]\nLAST_UPLOADED_IMAGE_URL="${lastImageUrl}"\nWhen calling generate_render, you MUST set sourceImageUrl="${lastImageUrl}" if the user wants to modify this image.`;
                    }

                    // 1. Start the actual AI stream
                    // Cast options to any to avoid strict type checks on experimental features
                    const result = streamText({
                        model: googleProvider(process.env.CHAT_MODEL_VERSION || 'gemini-3-flash-preview'),
                        system: activeSystemInstruction, // Use dynamic system prompt
                        messages: coreMessages as any,
                        tools: tools as any,
                        maxSteps: 5,
                        maxToolRoundtrips: 2, // Allow Gemini to use tools AND generate final response
                        experimental_providerMetadata: { sessionId },

                        // ✅ DIRECT TOOL RESULT STREAMING
                        // Write tool results directly to the stream instead of waiting for Gemini
                        async onToolCall({ toolCall, toolResult }: { toolCall: any; toolResult: any }) {
                            console.log('🔧 [Tool Call]', toolCall.toolName);

                            // 💸 PERPLEXITY: Stream market prices directly to chat
                            if (toolCall.toolName === 'get_market_prices' && toolResult) {
                                const resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                                console.log('📤 [Market Prices] Streaming to chat');
                                writeData('0', resultText);
                                streamedContent += resultText;
                            }
                        },

                        // Keep onFinish logic
                        onFinish: async ({ toolResults, finishReason, toolCalls }: { text?: string; toolResults: any[]; finishReason?: string; toolCalls?: any[] }) => {
                            console.log('[onFinish] 🔍 Streamed Content Length:', streamedContent.length);
                            console.log('[onFinish] 📊 Finish Reason:', finishReason || 'unknown');
                            console.log('[onFinish] 🔧 Tool Calls:', toolCalls?.length || 0);
                            console.log('[onFinish] 📋 Tool Results:', toolResults?.length || 0);
                            if (streamedContent.length === 0 && (!toolCalls || toolCalls.length === 0)) {
                                console.warn('[onFinish] ⚠️ EMPTY RESPONSE: No text and no tool calls - Model may be refusing');
                            }
                            console.log('[onFinish] Saving assistant message');

                            try {
                                // ✅ SINGLE SOURCE OF TRUTH: Save exactly what was streamed to user
                                await saveMessage(sessionId, 'assistant', streamedContent, {
                                    toolCalls: toolResults?.map((tr: any) => ({
                                        name: tr.toolName || 'unknown',
                                        args: tr.args || {},
                                        result: tr.result || {}
                                    }))
                                });
                                console.log('[onFinish] ✅ Message saved successfully');
                            } catch (error) {
                                console.error('[onFinish] ❌ CRITICAL: Failed to save message', error);
                            }
                        },
                    } as any);

                    // 2. Consume the FULL stream to capture tools and text
                    // We iterate over the full event stream to manually inject tool outputs (images) as text
                    // 
                    // 🔍 GOOGLE SEARCH GROUNDING: When the model uses google_search,
                    // results are automatically incorporated into text-delta responses.
                    // The AI SDK handles grounding metadata internally, including:
                    // - webSearchQueries: Search queries used
                    // - searchEntryPoint: Main search result content
                    // - groundingSupports: Citations and confidence scores
                    for await (const part of result.fullStream) {
                        if (part.type === 'text-delta') {
                            streamedContent += part.text;
                            writeData('0', part.text);
                        }

                        // Check for tool results (specifically our generation tool)
                        // ✅ SECURITY FIX: Robust error handling for tool failures

                        // 💸 PERPLEXITY: Write market prices to stream  
                        if (part.type === 'tool-result' && part.toolName === 'get_market_prices') {
                            try {
                                const result = (part as any).result || (part as any).output;
                                const resultText = typeof result === 'string' ? result : JSON.stringify(result);
                                console.log('📤 [Market Prices] Writing to stream:', resultText.substring(0, 100));
                                writeData('0', resultText);
                                streamedContent += resultText;
                            } catch (error) {
                                console.error('❌ [Market Prices] Stream error:', error);
                            }
                        }

                        if (part.type === 'tool-result' && part.toolName === 'generate_render') {
                            try {
                                const result = (part as any).result || (part as any).output;

                                // Check for error status first (tool-level failure)
                                if (result?.status === 'error') {
                                    const errorMessage = `\n\n⚠️ Mi dispiace, il servizio di rendering è temporaneamente non disponibile.\nErrore tecnico: ${JSON.stringify(result.error)}\n\n`;
                                    console.error('[Stream] Tool returned error:', result.error);
                                    streamedContent += errorMessage;
                                    writeData('0', errorMessage);
                                } else if (result?.status === 'success' && result?.imageUrl) {
                                    // Inject the image as a markdown text chunk
                                    const imageMarkdown = `\n\n![](${result.imageUrl}) \n\n`;
                                    console.log('[Stream] Injecting image to stream:', result.imageUrl);
                                    streamedContent += imageMarkdown;
                                    writeData('0', imageMarkdown);
                                } else {
                                    // Unexpected result format
                                    const unexpectedError = '\n\n⚠️ Si è verificato un errore imprevisto. Riprova.\n\n';
                                    console.warn('[Stream] Unexpected tool result format:', result);
                                    streamedContent += unexpectedError;
                                    writeData('0', unexpectedError);
                                }
                            } catch (toolError) {
                                // Catch any unexpected errors during tool result processing
                                const processingError = '\n\n⚠️ Si è verificato un errore durante la generazione. Riprova.\n\n';
                                console.error('[Stream] Error processing tool result:', toolError);
                                streamedContent += processingError;
                                writeData('0', processingError);
                            }
                        }

                        // We also likely need to send tool call info if we want to be "correct", 
                        // but for this specific "Text + Image" requirement, injecting text is safer.

                        // ✅ FIX: Forward tool calls to client (Protocol '9')
                        if (part.type === 'tool-call') {
                            const p = part as any;
                            const toolCall = {
                                toolCallId: p.toolCallId,
                                toolName: p.toolName,
                                args: p.args || p.input || {}
                            };
                            writeData('9', toolCall);
                        }

                        // ✅ Forward ALL tool results (Protocol 'a') for frontend metadata access
                        // User-facing content sent via Protocol '0', metadata via Protocol 'a'
                        if (part.type === 'tool-result') {
                            const p = part as any;
                            const toolResult = {
                                toolCallId: p.toolCallId,
                                result: p.result
                            };
                            writeData('a', toolResult);
                        }
                    }

                    // 3. Close the stream cleanly
                    controller.close();

                } catch (error: any) {
                    // Protocol: '3' key for error messages
                    writeData('3', { error: error.message });
                    console.error("Stream Error:", error);
                    controller.close();
                }
            }
        });

        // Return the standard response with correct headers
        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Vercel-AI-Data-Stream': 'v1', // Activates frontend tool/image mode
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': resetAt.toISOString(),
            },
        });

    } catch (error: any) {
        console.error("Chat API Error Details:", error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
