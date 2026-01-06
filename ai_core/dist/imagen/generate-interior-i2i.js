import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
/**
 * Generate interior design image using Gemini Multimodal Editing (Text+Image -> Image)
 *
 * This function uses the experimental Gemini 3 capabilities via Vertex AI to
 * perform high-fidelity interior renovation by understanding the structural context
 * of the input image and applying stylistic changes based on the prompt.
 *
 * It replaces the previous Imagen I2I pipeline.
 */
export async function generateInteriorImageI2I(options) {
    const { prompt, referenceImage, modificationType = 'renovation', } = options;
    console.log('[Gemini Multimodal] Starting generation...');
    console.log('[Gemini Multimodal] Modification Type:', modificationType);
    console.log('[Gemini Multimodal] Prompt:', prompt.substring(0, 100) + '...');
    const startTime = Date.now();
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const location = 'us-central1'; // Multimodal preview models are typically in us-central1
        if (!projectId) {
            throw new Error('Missing FIREBASE_PROJECT_ID in environment variables');
        }
        // Initialize Vertex AI
        const vertex_ai = new VertexAI({ project: projectId, location: location });
        // Use the VISION model version which maps to Gemini 3 Pro Image Preview
        // Default to gemini-experimental if not set, but user specified gemini-3-pro-image-preview
        const modelName = process.env.VISION_MODEL_VERSION || 'gemini-3-pro-image-preview';
        console.log('[Gemini Multimodal] Using model:', modelName);
        // Instantiate the generative model
        const generativeModel = vertex_ai.getGenerativeModel({
            model: modelName,
            safetySettings: [{
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }, {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }, {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }, {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }],
            generationConfig: {
                // Multimodal generation parameters
                maxOutputTokens: 8192, // High limit for image data
                temperature: 0.2, // Lower temperature (was 0.4) for stricter adherence to image
                topP: 0.95,
            }
        });
        // 1. Fetch the reference image and convert to Base64
        console.log('[Gemini Multimodal] Fetching reference image...');
        const { data: base64Image, mimeType } = await fetchImageAsBase64(referenceImage);
        // 2. Construct Multimodal Prompt
        // We instruct the model precisely on its role and constraints
        const systemInstruction = `Function: Interior Design Architect.
Task: Renovate this room based on the user's request.
CRITICAL CONSTRAINT: You MUST maintain the exact perspective, window placement, fireplace shape, and structural walls of the provided image.
DO NOT modify the architectural shell.
DO NOT move, resize, or reshape windows or fireplaces.
Only change materials, lighting, and furniture.
Output: Generate a high-quality, photorealistic image of the renovated room.`;
        const multimodalPrompt = {
            inlineData: {
                mimeType: mimeType,
                data: base64Image
            }
        };
        const textPart = {
            text: `${systemInstruction}\n\nUser Request: ${prompt}\n\nGenerate the image now.`
        };
        const request = {
            contents: [
                {
                    role: 'user',
                    parts: [multimodalPrompt, textPart]
                }
            ]
        };
        console.log('[Gemini Multimodal] Sending request to Vertex AI...');
        // 3. Generate Content
        const response = await generativeModel.generateContent(request);
        const result = await response.response;
        console.log('[Gemini Multimodal] Response received');
        // 4. Extract Image from candidates
        // Gemini Multimodal returns the image as inline data in the parts
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('No candidates returned from Gemini');
        }
        const candidate = result.candidates[0];
        // Look for image part
        let generatedImageBase64;
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                generatedImageBase64 = part.inlineData.data;
                console.log(`[Gemini Multimodal] Found generated image (${part.inlineData.mimeType})`);
                break;
            }
        }
        if (!generatedImageBase64) {
            // Fallback: Check if it returned a text description instead of an image (refusal or error)
            const textResponse = candidate.content.parts.find(p => p.text)?.text;
            console.error('[Gemini Multimodal] Failed to generate image. Model text response:', textResponse);
            throw new Error('Model produced text instead of an image. It might have refused the request or failed to generate.');
        }
        // 5. Convert to Buffer
        const imageBuffer = Buffer.from(generatedImageBase64, 'base64');
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Gemini Multimodal] Generation complete in ${elapsedTime}s`);
        console.log(`[Gemini Multimodal] Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
        return imageBuffer;
    }
    catch (error) {
        console.error('[Gemini Multimodal] Error:', error);
        if (error instanceof Error) {
            console.error('[Gemini Multimodal] Detailed error:', error.message, error.stack);
            // Helpful error mapping
            if (error.message.includes('403') || error.message.includes('PermissionDenied')) {
                throw new Error('Vertex AI permission denied. Check service account and API enablement.');
            }
        }
        throw new Error('Failed to generate renovation using Gemini Multimodal.');
    }
}
/**
 * Fetch image from URL and convert to base64 with MIME type detection
 * (Duplicated helper to avoid circular deps or complex imports, keeping file self-contained)
 */
async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`Failed to fetch image: ${response.status}`);
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return { data: buffer.toString('base64'), mimeType };
    }
    catch (error) {
        console.error('Error fetching image:', error);
        throw error;
    }
}
/**
 * Build prompt for multimodal editing
 * Note: The multimodal model is smarter, so we can use a simpler, more direct prompt
 * than the previous I2I strategy.
 */
export function buildI2IEditingPrompt(options) {
    const { userPrompt, structuralElements, roomType, style } = options;
    // We still benefit from being descriptive
    return `Renovate this ${roomType} in a ${style} style. 
    ${userPrompt ? `Specific requirements: ${userPrompt}.` : ''} 
    ${structuralElements ? `CONTEXT: The room features ${structuralElements} which must be preserved.` : ''}
    Ensure the result is fully furnished, photorealistic, and 8k quality.`;
}
