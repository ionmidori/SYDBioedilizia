
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';

/**
 * The Painter: Executes the renovation using the provided Locked Prompt.
 * Uses Gemini 3 Pro Image Preview (Multimodal) for high-fidelity generation.
 * 
 * ROLE: Senior AI Engineer Implementation
 * MODEL: gemini-3-pro-image-preview
 * REGION: us-central1
 */
export async function generateRenovation(imageBuffer: Buffer, prompt: string): Promise<Buffer> {
    console.log(`[Painter] Starting renovation generation...`);
    // console.log(`[Painter] Prompt length: ${prompt.length} chars`);

    // STEP 2: The Painter (Vertex AI Generation) - DIRECT EXECUTION
    // The prompt is now provided by the orchestrator (JIT Pipeline)
    const finalPrompt = `${prompt}\n\nOutput a high-res renovation image.`;

    // STEP 2: The Painter (Vertex AI Generation)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const location = 'us-central1'; // REQUIRED for preview models

    if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID not found');
    }

    // Initialize Vertex AI with explicit auth support for local dev
    const vertex_ai = new VertexAI({
        project: projectId,
        location: location,
        googleAuthOptions: process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? {
            credentials: {
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            }
        } : undefined
    });

    // Use the model version from env (User requested: gemini-2.5-flash-image for I2I)
    const envModel = process.env.VISION_MODEL_VERSION;
    const modelName = envModel || 'gemini-2.5-flash-image';
    console.log(`[Painter] ENV VISION_MODEL_VERSION: ${envModel}`);
    console.log(`[Painter] Initializing model: ${modelName} in ${location}`);

    const generativeModel = vertex_ai.getGenerativeModel({
        model: modelName,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ],
        generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.2, // Keep low to respect the "Locked" instructions
            topP: 0.95,
        }
    });

    try {
        const base64Image = imageBuffer.toString('base64');
        const mimeType = 'image/jpeg';

        const multimodalPrompt = {
            inlineData: {
                mimeType: mimeType,
                data: base64Image
            }
        };

        const textPart = {
            text: finalPrompt
        };

        const request = {
            contents: [{
                role: 'user',
                parts: [multimodalPrompt, textPart]
            }]
        };

        console.log('[Painter] Sending request to Vertex AI...');
        const response = await generativeModel.generateContent(request);
        const result = await response.response;

        // Extract Image
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('No candidates returned');
        }

        const candidate = result.candidates[0];
        let generatedImageBase64: string | undefined;

        for (const part of candidate.content.parts) {
            // Check for inlineData (Base64)
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                generatedImageBase64 = part.inlineData.data;
                break;
            }
            // Future-proofing: Check for fileData (URI) if returned by some versions
            // @ts-ignore
            if (part.fileData && part.fileData.mimeType.startsWith('image/')) {
                console.warn('[Painter] Received fileData URL instead of inlineData, functionality might need update.');
            }
        }

        if (!generatedImageBase64) {
            console.error('[Painter] Full Response:', JSON.stringify(result, null, 2));
            throw new Error('Model returned valid response but NO image data found.');
        }

        const generatedBuffer = Buffer.from(generatedImageBase64, 'base64');
        console.log(`[Painter] ✅ Generation complete! Image size: ${(generatedBuffer.length / 1024).toFixed(2)} KB`);

        return generatedBuffer;

    } catch (error) {
        console.error('[Painter] Error:', error);
        if (error instanceof Error && error.message.includes('404')) {
            throw new Error(`Model ${modelName} not found in ${location}. Ensure Project ID is allowlisted.`);
        }
        throw new Error(`Painter generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
