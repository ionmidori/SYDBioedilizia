import { VertexAI } from '@google-cloud/vertexai';

/**
 * The Architect: Generates a strictly controlled prompt for the Painter.
 * Uses Gemini Flash (via Vertex AI) to "lock" the geometry before generation.
 * 
 * @param imageBuffer - The source image buffer
 * @param targetStyle - The desired renovation style (e.g., "Minimalist", "Industrial")
 * @param keepElements - List of elements to explicitly preserve (from user chat)
 * @returns A string containing the "Locked Prompt" for the image generator
 */
export async function generateArchitecturalPrompt(imageBuffer: Buffer, targetStyle: string, keepElements: string[] = []): Promise<string> {
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

    // Initialize Vertex AI with explicit auth support for local dev (Same as generator.ts)
    const vertexAI = new VertexAI({
        project: projectId,
        location: location,
        googleAuthOptions: process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? {
            credentials: {
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            }
        } : undefined
    });

    // 3. Use the variable
    const model = vertexAI.getGenerativeModel({ model: modelName });
    const base64Image = imageBuffer.toString('base64');

    // Preservation Logic Injection
    const preservationList = keepElements.length > 0
        ? keepElements.join(', ')
        : "None specified (preserve structural shell only)";

    const systemPrompt = `
    ROLE: High-End Interior Renovation Architect & Prompt Engineer.
    
    GOAL: Write a generation prompt for Gemini 3 (Nano Banana) to renovate the input room based on style: "${targetStyle}".

    --- PHASE 1: STRUCTURAL ANALYSIS (THE "SKELETON") ---
    1.  **Perspective Lock (CRITICAL):** You MUST maintain the exact camera angle, focal length, and vanishing points. The 3D volume of the room is sacred.
    2.  **Wall/Window Logic:** * Unless the user EXPLICITLY asks to remove a wall ("open space", "demolish"), keep the wall positions fixed.
        * HOWEVER, you are FREE to change the *surface materials* of these walls (e.g., paint, wallpaper, brick, wood paneling).
    3.  **STRICT PRESERVATION (User Constraints):** 
        * The user has explicitly identified these elements to KEEP: [${preservationList}].
        * You MUST write negative constraints or clear instructions to ensure these specific objects remain UNTOUCHED.

    --- PHASE 2: FURNISHING RULES (THE "OCCLUSION PERMISSION") ---
    * **Override Rule:** Furniture, rugs, and decor are ALLOWED and ENCOURAGED to cover/occlude the original floors and walls.
    * **No Floating:** Objects must sit firmly on the ground.
    * **Infilling:** If the room looks empty, you MUST invent furniture to fill the void consistent with the requested style.

    --- PHASE 3: STYLING & ATMOSPHERE (THE "CLUTTER") ---
    To achieve "Magazine Quality" realism, you must instruct the generator to add:
    1.  **Layering:** Rugs on floors, throws on sofas, pillows on chairs.
    2.  **Lived-in Details ("Clutter"):** Coffee cups, open books, magazines, remote controls, vases with imperfections.
    3.  **Verticality:** Floor lamps, tall indoor trees (Ficus/Olive), hanging pendant lights.
    4.  **Foreground Depth:** Suggest placing an out-of-focus element (like a plant leaf or chair back) in the immediate foreground.

    --- PHASE 4: PROMPT ENGINEERING (THE "GOLDEN STACK") ---
    You act as a world-class Prompt Engineer. You must format the final output using this specific professional structure to trigger high-fidelity generation:

    Structure (CRITICAL ORDER):
    "[COMMAND] + [SUBJECT] + [PRESERVE]"

    MANDATORY KEYWORDS TO INCLUDE (Pick relevant ones):
    * **Lighting:** "Volumetric lighting", "Global illumination", "Cinematic soft light", "God rays from window", "Ambient occlusion".
    * **Realism:** "Photorealistic", "8k resolution", "Unreal Engine 5 render", "Archdaily photography", "Architectural Digest style", "Hyper-detailed textures".
    * **Camera:** "24mm wide angle lens", "f/8 aperture", "Depth of field", "Sharp focus".

    --- FINAL OUTPUT INSTRUCTION ---
    Write ONLY the final generation prompt string. Do not write explanations.
    
    YOU MUST START WITH THIS EXACT COMMAND (verbatim):
    "[COMMAND]: IGNORE the original image's lighting, shadows, and bad quality. Treat the input image ONLY as a loose 3D wireframe. You MUST synthesize completely NEW studio-quality lighting. REPLACE all textures."
    
    THEN provide the [SUBJECT] description (photorealistic description of the room, style, furniture, staging, clutter, lighting details, camera specs).
    
    END with [PRESERVE] constraints (what must remain untouched: [${preservationList}]).
    
    Example structure:
    "[COMMAND]: IGNORE the original image's lighting, shadows, and bad quality. Treat the input image ONLY as a loose 3D wireframe. You MUST synthesize completely NEW studio-quality lighting. REPLACE all textures. [SUBJECT]: A photorealistic wide-angle shot of a Modern Rustic living room... [STAGING]: heavily furnished... [LIGHTING]: Soft morning sunlight... [TECH]: 8k, Unreal Engine... [PRESERVE]: Absolutely keep [${preservationList}]."
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

        const generatedPrompt = result.response.candidates?.[0].content.parts[0].text;

        if (!generatedPrompt) {
            // Fallback di sicurezza se Gemini è muto
            return `A photorealistic renovation of a room in ${targetStyle} style, maintaining perspective but fully furnished. Preserve: ${preservationList}.`;
        }

        console.log('[Architect] 🔒 High-End Prompt Generated (Vertex AI)');
        console.log('[Architect] 🔒 High-End Prompt Generated (Vertex AI):');
        console.log(generatedPrompt);

        return generatedPrompt;

    } catch (error) {
        console.error("[Architect] Error:", error);
        return `${targetStyle}, photorealistic, 8k, maintain perspective. Preserve: ${preservationList}.`;
    }
}
