import { generateImagenRenovation } from './imagen_client';
/**
 * Builds a professional narrative prompt from ArchitectOutput using Positive Anchoring.
 * Implements the "Skeleton & Skin" methodology.
 *
 * @param architectData - Output from the Architect containing skeleton, materials, and furnishing
 * @param style - Target style name (e.g., "Japandi", "Industrial")
 * @returns Fluent narrative prompt for image generation
 */
function buildProfessionalPrompt(architectData, style) {
    // Block 1: Context & Subject
    const context = `Professional architectural photography of a living space designed in ${style}, shot for an interior design magazine.`;
    // Block 2: Structural Anchoring (The Skeleton)
    // Describes the geometry Gemini MUST see and respect
    // Note: structuralSkeleton already starts with "The room features..."
    const structure = architectData.structuralSkeleton;
    // Block 3: Material Application (The New Skin)
    // Removed "The space is finished with" prefix to avoid stuttering ("...with Walls finished in...")
    const surfaces = architectData.materialPlan;
    // Block 4: Furnishing & Atmosphere
    // Removed "The area is furnished with" prefix to avoid stuttering ("...with A low-profile sofa...")
    const decor = architectData.furnishingStrategy;
    // Block 5: Quality & Lighting
    const techSpecs = `Soft volumetric natural lighting, photorealistic, 8k resolution, sharp focus, highly detailed textures, raytracing.`;
    // Fluent Assembly
    return `${context} ${structure} ${surfaces} ${decor} ${techSpecs}`;
}
/**
 * The Painter: Executes the renovation using narrative prompting strategy.
 * Uses Gemini 3 Pro Image Preview (Multimodal) for high-fidelity generation.
 *
 * ROLE: Prompt Builder & Image Generator
 * MODEL: gemini-3-pro-image-preview
 */
export async function generateRenovation(imageBuffer, architectOutput, style) {
    console.log(`[Painter] Starting renovation generation with style: ${style}`);
    console.log(`[Painter] Skeleton: ${architectOutput.structuralSkeleton.substring(0, 80)}...`);
    console.log(`[Painter] Materials: ${architectOutput.materialPlan.substring(0, 80)}...`);
    console.log(`[Painter] Furnishing: ${architectOutput.furnishingStrategy.substring(0, 80)}...`);
    // BUILD PROFESSIONAL NARRATIVE PROMPT
    const professionalPrompt = buildProfessionalPrompt(architectOutput, style);
    console.log(`[Painter] PROFESSIONAL PROMPT LENGTH: ${professionalPrompt.length} chars`);
    console.log(`[Painter] Full Prompt:`, professionalPrompt);
    // Negative constraints (what to avoid)
    const NEGATIVE_CONSTRAINTS = `AVOID: blurry, low quality, distorted perspective, bad architecture, debris remaining, messy, cluttered, ugly furniture, watermark, text, signature, oversaturated, CGI looking, cartoon, unrealistic lighting, motion blur, spinning objects.`;
    // EXECUTE IMAGE GENERATION
    console.log('[Painter] Starting Gemini 3 Pro Image generation...');
    try {
        const base64Image = imageBuffer.toString('base64');
        // Call ImagenClient with narrative prompt
        const response = await generateImagenRenovation({
            imageBase64: base64Image,
            mimeType: 'image/jpeg',
            prompt: professionalPrompt,
            negativePrompt: NEGATIVE_CONSTRAINTS.replace('AVOID: ', ''),
        });
        const generatedBuffer = Buffer.from(response.imageBase64, 'base64');
        console.log(`[Painter] ✅ Generation complete! Image size: ${(generatedBuffer.length / 1024).toFixed(2)} KB`);
        return generatedBuffer;
    }
    catch (error) {
        console.error('[Painter] Error:', error);
        throw new Error(`Painter generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
