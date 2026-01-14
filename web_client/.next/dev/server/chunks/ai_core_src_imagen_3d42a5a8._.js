module.exports = [
"[project]/ai_core/src/imagen/imagen_client.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateImagenRenovation",
    ()=>generateImagenRenovation
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@google/generative-ai/dist/index.mjs [app-route] (ecmascript)");
;
async function generateImagenRenovation(request) {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelId = 'gemini-3-pro-image-preview'; // User requested specific model
    if (!apiKey) {
        throw new Error('[ImagenClient] GEMINI_API_KEY environment variable is required');
    }
    console.log(`[ImagenClient] Initializing GoogleGenerativeAI (model: ${modelId})...`);
    const genAI = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["GoogleGenerativeAI"](apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId,
        // Request image output capability
        generationConfig: {
            responseModalities: [
                'IMAGE',
                'TEXT'
            ]
        },
        safetySettings: [
            {
                category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmCategory"].HARM_CATEGORY_HARASSMENT,
                threshold: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmBlockThreshold"].BLOCK_ONLY_HIGH
            },
            {
                category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmCategory"].HARM_CATEGORY_HATE_SPEECH,
                threshold: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmBlockThreshold"].BLOCK_ONLY_HIGH
            },
            {
                category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmCategory"].HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmBlockThreshold"].BLOCK_ONLY_HIGH
            },
            {
                category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmCategory"].HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["HarmBlockThreshold"].BLOCK_ONLY_HIGH
            }
        ]
    });
    // Prepare Image Part
    const imagePart = {
        inlineData: {
            data: request.imageBase64,
            mimeType: request.mimeType
        }
    };
    // Prepare Prompt with Geometric Base Instruction
    // This simulates "ControlNet" (geometry lock) via prompt engineering
    const geometricInstruction = `[INSTRUCTION: Use the visual layout of the attached image as the strict geometric base. Maintain all structural lines, edges, and spatial relationships exactly. Redesign ONLY the surfaces, materials, lighting, and furnishings according to the description below.]`;
    const fullPrompt = `${geometricInstruction}\n\n${request.prompt}\n\n[NEGATIVE CONSTRAINTS]: ${request.negativePrompt}`;
    console.log(`[ImagenClient] Sending multimodal request...`);
    console.log(`  - Prompt Length: ${fullPrompt.length} chars`);
    try {
        // Generate Content with [Prompt, Image]
        const result = await model.generateContent([
            fullPrompt,
            imagePart
        ]);
        const response = await result.response;
        console.log(`[ImagenClient] Response received`);
        // Extract Image from Response
        let outputImageBase64 = null;
        if (response.candidates && response.candidates.length > 0) {
            const parts = response.candidates[0].content.parts;
            for (const part of parts){
                if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                    outputImageBase64 = part.inlineData.data;
                    break;
                }
            }
        }
        if (!outputImageBase64) {
            console.error('[ImagenClient] No image found in response parts:', JSON.stringify(response, null, 2));
            throw new Error('No image data returned from Gemini API');
        }
        const imageSizeKb = (outputImageBase64.length * 0.75 / 1024).toFixed(2);
        console.log(`[ImagenClient] ✅ Generation complete! Image size: ~${imageSizeKb} KB`);
        return {
            imageBase64: outputImageBase64,
            metadata: {
                modelVersion: modelId
            }
        };
    } catch (error) {
        console.error('[ImagenClient] ❌ API error:', error);
        throw new Error(`Gemini generation failed: ${error.message || error} `);
    }
}
}),
"[project]/ai_core/src/imagen/generator.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateRenovation",
    ()=>generateRenovation
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$imagen_client$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/imagen_client.ts [app-route] (ecmascript)");
;
/**
 * Builds a professional narrative prompt from ArchitectOutput using Positive Anchoring.
 * Implements the "Skeleton & Skin" methodology.
 * 
 * @param architectData - Output from the Architect containing skeleton, materials, and furnishing
 * @param style - Target style name (e.g., "Japandi", "Industrial")
 * @returns Fluent narrative prompt for image generation
 */ function buildProfessionalPrompt(architectData, style) {
    // Block 1: Context & Subject
    const context = `Professional architectural photography of a ${style} living space, shot for an interior design magazine.`;
    // Block 2: Structural Anchoring (The Skeleton)
    // Describes the geometry Gemini MUST see and respect
    // Note: structuralSkeleton already starts with "The room features..."
    const structure = architectData.structuralSkeleton;
    // Block 3: Material Application (The New Skin)
    const surfaces = `The space is finished with ${architectData.materialPlan}.`;
    // Block 4: Furnishing & Atmosphere
    const decor = `The area is furnished with ${architectData.furnishingStrategy}.`;
    // Block 5: Quality & Lighting
    const techSpecs = `Soft volumetric natural lighting, photorealistic, 8k resolution, sharp focus, highly detailed textures, raytracing.`;
    // Fluent Assembly
    return `${context} ${structure} ${surfaces} ${decor} ${techSpecs}`;
}
async function generateRenovation(imageBuffer, architectOutput, style) {
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
        const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$imagen_client$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateImagenRenovation"])({
            imageBase64: base64Image,
            mimeType: 'image/jpeg',
            prompt: professionalPrompt,
            negativePrompt: NEGATIVE_CONSTRAINTS.replace('AVOID: ', '')
        });
        const generatedBuffer = Buffer.from(response.imageBase64, 'base64');
        console.log(`[Painter] ✅ Generation complete! Image size: ${(generatedBuffer.length / 1024).toFixed(2)} KB`);
        return generatedBuffer;
    } catch (error) {
        console.error('[Painter] Error:', error);
        throw new Error(`Painter generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
}),
];

//# sourceMappingURL=ai_core_src_imagen_3d42a5a8._.js.map