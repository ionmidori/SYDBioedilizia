import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

/**
 * Imagen Client (Gemini API Version)
 * 
 * Uses the Google Generative AI SDK for image renovation via `gemini-3-pro-image-preview`.
 */

export interface ImagenGenerationRequest {
    /** Base64-encoded input image buffer */
    imageBase64: string;
    /** MIME type of the input image (e.g., 'image/jpeg', 'image/png') */
    mimeType: string;
    /** The complete prompt for image generation */
    prompt: string;
    /** Negative prompt constraints */
    negativePrompt: string;
}

export interface ImagenGenerationResponse {
    /** Base64-encoded generated image */
    imageBase64: string;
    /** Generation metadata */
    metadata?: {
        modelVersion?: string;
    };
}

/**
 * Generate a renovation image using Gemini Pro Image Preview via API Key
 * 
 * @param request - Image generation parameters
 * @returns Promise containing the generated image as base64
 */
export async function generateImagenRenovation(
    request: ImagenGenerationRequest
): Promise<ImagenGenerationResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelId = 'gemini-3-pro-image-preview'; // User requested specific model

    if (!apiKey) {
        throw new Error('[ImagenClient] GEMINI_API_KEY environment variable is required');
    }

    console.log(`[ImagenClient] Initializing GoogleGenerativeAI (model: ${modelId})...`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId,
        // Request image output capability
        generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
        } as any, // Cast needed for preview SDK features
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
        ]
    });

    // Prepare Image Part
    const imagePart = {
        inlineData: {
            data: request.imageBase64,
            mimeType: request.mimeType,
        },
    };

    // Prepare Prompt with Geometric Base Instruction
    // This simulates "ControlNet" (geometry lock) via prompt engineering
    const geometricInstruction = `[INSTRUCTION: Use the visual layout of the attached image as the strict geometric base. Maintain all structural lines, edges, and spatial relationships exactly. Redesign ONLY the surfaces, materials, lighting, and furnishings according to the description below.]`;

    const fullPrompt = `${geometricInstruction}\n\n${request.prompt}\n\n[NEGATIVE CONSTRAINTS]: ${request.negativePrompt}`;

    console.log(`[ImagenClient] Sending multimodal request...`);
    console.log(`  - Prompt Length: ${fullPrompt.length} chars`);

    try {
        // Generate Content with [Prompt, Image]
        const result = await model.generateContent([fullPrompt, imagePart]);
        const response = await result.response;

        console.log(`[ImagenClient] Response received`);

        // Extract Image from Response
        let outputImageBase64: string | null = null;

        if (response.candidates && response.candidates.length > 0) {
            const parts = response.candidates[0].content.parts;
            for (const part of parts) {
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
                modelVersion: modelId,
            },
        };

    } catch (error: any) {
        console.error('[ImagenClient] ❌ API error:', error);
        throw new Error(`Gemini generation failed: ${error.message || error} `);
    }
}
