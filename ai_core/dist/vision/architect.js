import { GoogleGenerativeAI } from '@google/generative-ai';
/**
 * The Architect: Generates a strictly controlled prompt for the Painter.
 * Uses Gemini Flash to "lock" the geometry before generation.
 *
 * @param imageBuffer - The source image buffer
 * @param targetStyle - The desired renovation style (e.g., "Minimalist", "Industrial")
 * @returns A string containing the "Locked Prompt" for the image generator
 */
export async function generateArchitecturalPrompt(imageBuffer, targetStyle) {
    console.log('[Architect] Analyzing geometry to build Locked Prompt (Model: Flash)...');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use the Logic/Chat model (Flash) as requested
    const modelVersion = process.env.CHAT_MODEL_VERSION || 'gemini-3-flash-preview';
    const model = genAI.getGenerativeModel({ model: modelVersion });
    // The Architect's System Prompt
    // Focuses heavily on identifying what NOT to change.
    const systemPrompt = `Act as a Technical Architect. 
    Analyze the input image to extract the 'Geometry Map' (perspective, window placements, structural lines, ceiling height).
    
    Then write a STRICT prompt for an AI Image Generator that applies the style '${targetStyle}' but EXPLICITLY forbids changing the extracted geometry.
    
    Output format:
    [GEO-LOCK] <List of strict structural constraints, e.g., "Preserve arched window at left", "Keep exposed beams">
    [STYLE] <Detailed description of materials and lighting for ${targetStyle} style>
    [GENERATION_INSTRUCTION] "Renovate this room. Maintain the exact perspective and structural shell defined in GEO-LOCK. Apply the materials defined in STYLE."
    
    Return ONLY the raw prompt text.`;
    try {
        const base64Image = imageBuffer.toString('base64');
        const result = await model.generateContent([
            systemPrompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/jpeg'
                }
            }
        ]);
        const lockedPrompt = result.response.text();
        console.log('[Architect] 🔒 Geometry Prompt Generated');
        console.log(lockedPrompt.substring(0, 150) + '...');
        return lockedPrompt;
    }
    catch (error) {
        console.error('[Architect] Error:', error);
        throw new Error(`Architect analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
