import { VertexAI } from '@google-cloud/vertexai';

/**
 * Structured output from the Architect for narrative prompt generation.
 * Uses the "Skeleton & Skin" methodology: neutral geometry + material overlay + furnishing.
 */
export interface ArchitectOutput {
    /** 
     * Neutral description of fixed geometry (walls, ceiling, windows, doors, stairs).
     * Example: "The room features a high vaulted ceiling, a spiral staircase on the left, and a large bay window on the right."
     */
    structuralSkeleton: string;

    /** 
     * Material palette mapped to structural elements based on requested style.
     * Example: "Walls finished in matte lime wash, staircase in blonde oak wood, flooring in polished concrete."
     */
    materialPlan: string;

    /** 
     * Description of NEW furniture and decor to populate the space.
     * Example: "Low-profile minimalist beige sofas, paper lanterns, and woven jute rugs."
     */
    furnishingStrategy: string;

    /** 
     * Technical metadata (lighting quality, camera perspective).
     * Example: "Soft volumetric natural lighting, wide-angle view from corner."
     */
    technicalNotes: string;
}

/**
 * The Architect: Generates a narrative-based structural plan for the Painter.
 * Uses Gem ini Flash (via Vertex AI) to extract geometry and material planning.
 * 
 * @param imageBuffer - The source image buffer
 * @param targetStyle - The desired renovation style (e.g., "Japandi", "Industrial")
 * @param keepElements - List of elements to explicitly preserve (from user chat)
 * @returns ArchitectOutput object with skeleton, materials, and furnishing separated
 */
export async function generateArchitecturalPrompt(imageBuffer: Buffer, targetStyle: string, keepElements: string[] = []): Promise<ArchitectOutput> {
    const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash';

    console.log(`[Architect] Building narrative plan (Style: ${targetStyle}, Keep: ${keepElements.length})...`);
    console.log(`[Architect] Model: ${modelName} (Vertex AI)`);

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const location = 'us-central1';

    if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID not found');
    }

    const vertexAI = new VertexAI({
        project: projectId,
        location: location,
        // @ts-ignore
        apiVersion: 'v1beta1',
    });

    const model = vertexAI.getGenerativeModel({ model: modelName });
    const base64Image = imageBuffer.toString('base64');

    const preservationList = keepElements.length > 0
        ? keepElements.join(', ')
        : "None specified (renovate freely)";

    const systemPrompt = `
ROLE: You are an Architectural Surveyor and Interior Design Specialist.

GOAL: Analyze the input room image and generate a structured plan for renovation in the "${targetStyle}" style.

USER-SPECIFIED PRESERVATION: ${preservationList}

YOUR TASK: Generate FOUR FIELDS for a narrative-based image generation prompt.

---

FIELD 1: structuralSkeleton (Neutral Geometry Description)

Describe the FIXED GEOMETRY of the room. Focus ONLY on structure:
- Wall configuration and angles
- Ceiling type (flat/vaulted/beamed) and height
- Architectural features (fireplaces, alcoves, archways)
- Window and door placements
- Permanent fixtures (stairs, columns, beams)
- Room shape and spatial layout
- Camera perspective

**RULES:**
- DO NOT mention condition (old/damaged/dirty)
- DO NOT use imperative language ("preserve", "keep")
- DESCRIBE what exists
- Be specific about positions

**Material Normalization:**
If preserving items: "${preservationList}", use CLEAN names:
- "vecchio cotto" → "terracotta tile flooring"
- "scala legno rovinato" → "wooden staircase"

**Example:**
"The room features a high vaulted ceiling with exposed beams, a wooden staircase on the left with glass balustrade, a large rectangular window in a recessed alcove on the right, and a fireplace on the back wall. Terracotta tile flooring throughout."

---

FIELD 2: materialPlan (Style-Specific Material Mapping)

Based on "${targetStyle}", specify materials for structural elements.

CRITICAL INSTRUCTION FOR MATERIALS:
1. For NEW elements (furniture, decor, changed walls): Apply the requested style strictly (e.g., if 'Minimalist', use 'Light Oak', 'White Plaster').
2. For EXISTING STRUCTURAL elements (Stairs, Fireplace, Window Frames) that are kept:
   - DO NOT automatically change their material to fit the style unless explicitly asked.
   - Instead, DETECT the current material/color in the image (e.g., "Dark Mahogany", "Red Brick").
   - Describe it as "RESTORED" or "REFINISHED" to improve quality without changing the essence.
   - Use adjectives like: "polished", "varnished", "cleaned", "rich tone", "high-quality grain".

OUTPUT RULE:
In the 'materialPlan', for existing structures, write: "The existing [Structure Name] is preserved in its original [Color/Material] tone, refinished to a pristine condition."

Examples:
- Walls: "Walls finished in pure matte white plaster"
- Floor: "Restored terracotta tiles with polished surface catching warm daylight"
- Stairs (PRESERVED): "The staircase retains its original deep walnut hue but is refinished with a smooth satin varnish"
- Fireplace (PRESERVED): "The original stone fireplace is cleaned to reveal its natural grey texture"

**Example:**
"Walls finished in soft matte white, the staircase refinished in blonde oak wood catching ambientlight, flooring featuring restored terracotta with polished finish, and fireplace clad in white marble."

---

FIELD 3: furnishingStrategy (New Furniture & Decor)

Describe furniture/decor for "${targetStyle}".

Be EXTREMELY specific:
- "Low-profile sectional sofa in textured beige bouclé"
- "Noguchi-style coffee table with walnut base and glass top"
- "Hand-woven jute area rug, linen throw pillows in terracotta"
- "Sculptural ceramic vases, potted fiddle-leaf fig, art books"

Include:
1. Seating, tables
2. Lighting fixtures
3. Textiles (rugs, pillows, curtains)
4. Decor (plants, art, ceramics)
5. Atmosphere

**Example:**
"Low-profile beige linen sofa, natural oak coffee table, hand-woven jute rug, sheer linen curtains, potted fiddle-leaf fig, ceramic vases, paper pendant lights casting soft glow."

---

FIELD 4: technicalNotes (Lighting & Camera)

Brief technical specs:

**Example:**
"24mm wide-angle lens, f/8, soft volumetric natural lighting (5500K), warm accents (2700K), 8K photorealistic, global illumination."

---

OUTPUT FORMAT

Respond with ONLY valid JSON. No markdown, no explanations:

{
  "structuralSkeleton": "The room features...",
  "materialPlan": "Walls finished in...",
  "furnishingStrategy": "Low-profile sofa...",
  "technicalNotes": "24mm lens, f/8..."
}
`;

    try {
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
                    { text: systemPrompt }
                ]
            }]
        });

        const rawOutput = result.response.candidates?.[0].content.parts[0].text;

        if (!rawOutput) {
            console.warn('[Architect] No output, using fallback');
            return {
                structuralSkeleton: `A standard living room with ${preservationList || 'typical architectural features'}`,
                materialPlan: `Walls in ${targetStyle.toLowerCase()} style finish, flooring in complementary material`,
                furnishingStrategy: `${targetStyle} furniture and decor appropriate to the space`,
                technicalNotes: "24mm lens, f/8, photorealistic 8K, natural lighting"
            };
        }

        let cleanedOutput = '';
        try {
            cleanedOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedOutput);

            if (!parsed.structuralSkeleton || !parsed.materialPlan || !parsed.furnishingStrategy) {
                throw new Error('Missing required fields');
            }

            console.log(`[Architect] ✅ Structured Output Generated (Vertex AI)`);
            console.log(`[Architect] Skeleton: ${parsed.structuralSkeleton.length} chars`);
            console.log(`[Architect] Materials: ${parsed.materialPlan.length} chars`);
            console.log(`[Architect] Furnishing: ${parsed.furnishingStrategy.length} chars`);

            return {
                structuralSkeleton: parsed.structuralSkeleton,
                materialPlan: parsed.materialPlan,
                furnishingStrategy: parsed.furnishingStrategy,
                technicalNotes: parsed.technicalNotes || "24mm lens, f/8, photorealistic 8K, natural lighting"
            };

        } catch (parseError) {
            console.error('[Architect] JSON Parse Error:', parseError);
            console.log('[Architect] Raw output:', cleanedOutput || rawOutput);

            // Fallback with cleaned output
            return {
                structuralSkeleton: `A standard living room with ${preservationList || 'typical architectural features'}`,
                materialPlan: `Walls in ${targetStyle.toLowerCase()} style finish`,
                furnishingStrategy: (cleanedOutput || rawOutput || '').substring(0, 500) || `${targetStyle} furniture`,
                technicalNotes: "24mm lens, f/8, photorealistic 8K"
            };
        }

    } catch (error) {
        console.error('[Architect] Generation Error:', error);
        throw new Error(`Architect generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
