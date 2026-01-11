import { VertexAI } from '@google-cloud/vertexai';

/**
 * Structured output from the Architect for bifocal prompt generation.
 * Separates structural constraints from creative vision.
 */
export interface ArchitectOutput {
    /** Geometric elements that MUST be preserved from the original image */
    structuralAnchors: string[];
    /** Creative vision and styling instructions with high artistic freedom */
    styleVision: string;
    /** Technical metadata (lighting, perspective, camera settings) */
    technicalNotes: string;
    /** Geometric constraints for structural preservation (optional for backward compatibility) */
    geometricConstraints?: string[];
}


/**
 * The Architect: Generates a strictly controlled prompt for the Painter.
 * Uses Gemini Flash (via Vertex AI) to "lock" the geometry before generation.
 * 
 * @param imageBuffer - The source image buffer
 * @param targetStyle - The desired renovation style (e.g., "Minimalist", "Industrial")
 * @param keepElements - List of elements to explicitly preserve (from user chat)
 * @returns ArchitectOutput object with structural anchors and creative vision separated
 */
export async function generateArchitecturalPrompt(imageBuffer: Buffer, targetStyle: string, keepElements: string[] = []): Promise<ArchitectOutput> {
    // 1. Define model in a SINGLE variable
    const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash';

    // 2. Dynamic logging (now tells the truth)
    console.log(`[Architect] Analyzing geometry to build Locked Prompt (Style: ${targetStyle}, Keep: ${keepElements.length})...`);
    console.log(`[Architect] Model: ${modelName} (Vertex AI)`);

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const location = 'us-central1';

    if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID not found');
    }

    // Initialize Vertex AI
    // CHANGE: Using ADC for broader permissions
    const vertexAI = new VertexAI({
        project: projectId,
        location: location,
        // @ts-ignore
        apiVersion: 'v1beta1', // REQUIRED for Preview models
    });

    // 3. Use the variable
    const model = vertexAI.getGenerativeModel({ model: modelName });
    const base64Image = imageBuffer.toString('base64');

    // Preservation Logic Injection
    const preservationList = keepElements.length > 0
        ? keepElements.join(', ')
        : "None specified (preserve structural shell only)";

    const systemPrompt = `
    ROLE: Senior Architectural Analyst & Prompt Engineer for AI Image Generation.
    
    GOAL: Analyze the input room image and extract TWO DISTINCT LAYERS for renovation in style: "${targetStyle}".

    --- LAYER 1: STRUCTURAL ANCHORS (Sacred Geometry - DO NOT CHANGE) ---
    
    Identify and list what MUST remain unchanged from the original image:
    - **Wall positions and angles** (e.g., "Left wall at 45° angle")
    - **Window/door placements** (e.g., "Large window centered on north wall")
    - **Ceiling height and structural beams** (e.g., "Exposed wooden beam running east-west")
    - **Floor plan topology** (room shape, alcoves, niches)
    - **Perspective and camera angle** (e.g., "Wide-angle view from corner entrance")
    - **User-specified preservation**: ${preservationList}
    
    **CRITICAL: MATERIAL NORMALIZATION**
    When outputting preserved materials, you MUST use TECHNICAL, CLEAN terminology:
    - Remove condition qualifiers: "old", "damaged", "dirty", "worn", "vecchio", "sporco", "rovinato"
    - Use professional material names: "terracotta tile flooring" NOT "cotto vecchio"
    - Examples:
      * Input: "pavimento in cotto vecchio" → Output: "terracotta tile flooring"
      * Input: "pareti sporche" → Output: "painted wall surface"
      * Input: "legno rovinato" → Output: "natural wood flooring"
    
    IMPORTANT nuance for preservation:
    - **RULE: INTEGRATION OVER ISOLATION.** Preserved elements must NOT remain empty/isolated. They must "blend" (immischiare) with the new design.
    - If user keeps the **FLOOR**: Preserve the TILES/MATERIAL, but **MUST** place rugs, sofas, tables, and decor ON it.
    - If user keeps the **WALLS**: Preserve the COLOR/TEXTURE, but **MUST** hang art, place shelves, or position furniture AGAINST them.
    - If user keeps the **CEILING**: Preserve the BEAMS/STRUCTURE, but **MUST** hang lighting fixtures from it.
    - **General Rule**: The preserved structure is the STAGE; the furniture is the PERFORMANCE. Do not leave the stage empty.
    
    Output these as a JSON array under key "structuralAnchors".

    --- LAYER 2: STYLE VISION (Creative Freedom - GO WILD) ---
    
    Define the TRANSFORMATIVE vision for the space using high-impact language:
    
    1. **Interior Design Style**: Specify the aesthetic (e.g., "Industrial Loft with raw materials", "Scandinavian Minimalism with warm accents")
    2. **Color Palette & Mood**: Define atmosphere (e.g., "Moody charcoal tones with brass accents", "Bright whites with natural oak warmth")
    3. **Furniture Typology**: Describe pieces (e.g., "Mid-century modern leather sofa, marble coffee table, vintage rug")
    4. **Material Finishes**: Specify textures (e.g., "Reclaimed wood flooring, exposed brick accent wall, linen curtains")
    5. **Lighting Atmosphere**: Set the mood (e.g., "Dramatic side lighting with warm 2700K temperature, volumetric god rays from window")
    6. **Staging & Details**: Add realism (e.g., "Heavily furnished with layered textiles, coffee table books, indoor olive tree in corner")
    
    95:     Use TRANSFORMATION PHRASES like:
    96:     - "ELEVATE the space to luxury boutique hotel quality..."
    97:     - "TRANSFORM the atmosphere into a cozy reading sanctuary..."
    98:     - "REIMAGINE the furniture with high-end Italian designer pieces..."
    99:
    100:    **MANDATORY**: You MUST end the styleVision string with a specific directive for wall color, derived from the user's request (e.g. " Walls: Painted in [Specific Color]"). If user didn't specify, choose a color that fits the style perfectly.
    101:     
    102:     Output this as a string under key "styleVision".

    --- LAYER 3: TECHNICAL SPECIFICATIONS ---
    
    Provide rendering metadata focusing on PHOTOREALISTIC LIGHTING:
    - Camera: "24mm wide-angle lens, f/8 aperture, sharp focus throughout"
    - Rendering Engine: "Physically-Based Rendering (PBR) with Global Illumination enabled"
    - Lighting Physics: "Natural daylight (5500-6500K), soft volumetric shadows, ambient occlusion at surface junctions, color bounce from floor to walls"
    - Material Quality: "High-resolution PBR textures (8K diffuse/normal/specular maps), anisotropic filtering for wood grain, subsurface scattering for fabrics"
    
    Output as string under key "technicalNotes".


    --- CRITICAL OUTPUT FORMAT ---
    
    You MUST respond with ONLY valid JSON. No explanations, no markdown code blocks. Just raw JSON:
    
    {
      "structuralAnchors": [
        "Anchor 1 description",
        "Anchor 2 description"
      ],
      "styleVision": "TRANSFORM this living room into a sophisticated Industrial Loft...",
      "technicalNotes": "24mm wide-angle lens, f/8, photorealistic 4K, global illumination"
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
            console.warn('[Architect] No output from model, using fallback');
            return {
                structuralAnchors: keepElements.length > 0 ? keepElements : [preservationList],
                styleVision: `TRANSFORM this space into a ${targetStyle} interior with high-end furnishings and materials`,
                technicalNotes: "24mm lens, f/8, photorealistic 4K, global illumination"
            };
        }

        try {
            // Parse JSON response
            const parsed = JSON.parse(rawOutput.trim());

            // Validate structure
            if (!parsed.structuralAnchors || !parsed.styleVision || !parsed.technicalNotes) {
                throw new Error('Missing required fields in JSON output');
            }

            console.log('[Architect] ✅ Structured Output Generated (Vertex AI)');
            console.log(`[Architect] Anchors: ${parsed.structuralAnchors.length}, Vision length: ${parsed.styleVision.length} chars`);

            return {
                structuralAnchors: parsed.structuralAnchors,
                styleVision: parsed.styleVision,
                technicalNotes: parsed.technicalNotes,
                geometricConstraints: [
                    "Maintain wall geometry and room proportions",
                    "Preserve window and door placements",
                    "Keep ceiling height"
                ]
            };

        } catch (parseError) {
            console.warn('[Architect] JSON parsing failed, attempting fallback parsing:', parseError);

            // Fallback: Try to extract sections manually
            return {
                structuralAnchors: keepElements.length > 0 ? keepElements : [preservationList],
                styleVision: rawOutput, // Use raw output as style vision
                technicalNotes: "24mm lens, f/8, photorealistic 4K, global illumination",
                geometricConstraints: [
                    "Maintain wall geometry and room proportions",
                    "Preserve window and door placements",
                    "Keep ceiling height"
                ]
            };
        }

    } catch (error) {
        console.error("[Architect] Error:", error);
        return {
            structuralAnchors: keepElements.length > 0 ? keepElements : [preservationList],
            styleVision: `${targetStyle} interior renovation with photorealistic materials`,
            technicalNotes: "24mm lens, f/8, photorealistic 4K",
            geometricConstraints: [
                "Maintain wall geometry and room proportions",
                "Preserve window and door placements",
                "Keep ceiling height"
            ]
        };
    }
}
