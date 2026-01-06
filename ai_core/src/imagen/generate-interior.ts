import { GoogleAuth } from 'google-auth-library';

/**
 * Generate interior design image using Imagen 3 via REST API
 * Using REST API instead of SDK for better compatibility with service accounts
 */
export async function generateInteriorImage(options: {
    prompt: string;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    numberOfImages?: number;
}): Promise<Buffer> {
    const {
        prompt,
        aspectRatio = '16:9',
        numberOfImages = 1,
    } = options;

    console.log('[Imagen REST] Starting image generation...');
    console.log('[Imagen REST] Prompt:', prompt.substring(0, 100) + '...');

    const startTime = Date.now();

    try {
        // Initialize Google Auth with environment variables
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const projectId = process.env.FIREBASE_PROJECT_ID;

        if (!privateKey || !clientEmail || !projectId) {
            throw new Error('Missing Firebase credentials in environment variables');
        }

        const auth = new GoogleAuth({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey,
                project_id: projectId,
            },
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        if (!accessToken.token) {
            throw new Error('Failed to get access token');
        }

        console.log('[Imagen REST] Got access token');
        console.log('[Imagen REST] Project:', projectId);

        // ✅ BUG FIX #8: Configurable Imagen model version
        const location = 'us-central1';
        const model = process.env.IMAGEN_MODEL_VERSION || 'imagen-3.0-generate-001';

        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

        // API request payload
        const requestPayload = {
            instances: [
                {
                    prompt: prompt,
                }
            ],
            parameters: {
                sampleCount: numberOfImages,
                aspectRatio: aspectRatio,
                safetySetting: 'block_some',
                personGeneration: 'allow_adult',
            }
        };

        console.log('[Imagen REST] Calling API...');

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        // Make REST API call
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal,
        });
        clearTimeout(timeoutId); // Clear timeout on success

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Imagen REST] API Error:', response.status, errorText);
            throw new Error(`Imagen API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        console.log('[Imagen REST] API Response received');

        // Extract base64 image from response
        if (!result.predictions || result.predictions.length === 0) {
            throw new Error('No image generated');
        }

        // Imagen returns base64 encoded image in predictions[0].bytesBase64Encoded
        const base64Image = result.predictions[0].bytesBase64Encoded;

        if (!base64Image) {
            console.error('[Imagen REST] Response structure:', JSON.stringify(result, null, 2));
            throw new Error('No image data in response');
        }

        // Convert base64 to Buffer
        const imageBuffer = Buffer.from(base64Image, 'base64');

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Imagen REST] Image generated in ${elapsedTime}s`);
        console.log(`[Imagen REST] Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

        return imageBuffer;
    } catch (error) {
        console.error('[Imagen REST] Error:', error);

        // ✅ BUG FIX #10: User-friendly error messages (don't expose internal details)
        if (error instanceof Error) {
            // Log detailed error for debugging
            console.error('[Imagen REST] Detailed error:', error.message, error.stack);

            if (error.message.includes('403')) {
                throw new Error('Image generation service is currently unavailable. Please try again later.');
            }

            if (error.message.includes('404')) {
                throw new Error('Image generation service is currently unavailable. Please try again later.');
            }

            if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                throw new Error('Image generation timed out. Please try again.');
            }
        }

        // Generic user-friendly message
        throw new Error('Image generation failed. Please try again in a few moments.');
    }
}

/**
 * Enhanced prompt generator for interior design
 */
export function buildInteriorDesignPrompt(options: {
    userPrompt: string;
    roomType: string;
    style: string;
}): string {
    const { userPrompt, roomType, style } = options;

    const enhancedPrompt = `
Photorealistic interior design rendering of a ${roomType}.
Style: ${style}.
${userPrompt}

Professional architectural visualization quality with natural lighting, realistic materials and textures, proper perspective, modern high-end interior design, clean composition, 4K quality.
    `.trim();

    return enhancedPrompt;
}
