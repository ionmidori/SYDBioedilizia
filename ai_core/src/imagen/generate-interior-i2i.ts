import { GoogleAuth } from 'google-auth-library';

/**
 * Generate interior design image using Imagen 3 Capability (Image-to-Image Editing)
 * 
 * This function takes a reference image (user's photo) and modifies it based on the prompt
 * while preserving structural elements like windows, doors, and architectural features.
 * 
 * Using REST API instead of SDK for better compatibility with service accounts
 */
export async function generateInteriorImageI2I(options: {
    prompt: string;
    referenceImage: string; // Public HTTPS URL from Firebase Storage
    mode?: 'inpainting-insert' | 'inpainting-remove';
    maskMode?: 'auto' | 'manual';
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    numberOfImages?: number;
    modificationType?: 'renovation' | 'detail'; // New parameter
}): Promise<Buffer> {
    const {
        prompt,
        referenceImage,
        mode = 'inpainting-insert',
        maskMode = 'auto',
        aspectRatio = '16:9',
        numberOfImages = 1,
        modificationType = 'renovation', // Default to whole room renovation
    } = options;

    console.log('[Imagen I2I] Starting image-to-image editing...');
    console.log('[Imagen I2I] Modification Type:', modificationType);
    console.log('[Imagen I2I] Prompt:', prompt.substring(0, 100) + '...');

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

        console.log('[Imagen I2I] Got access token');
        console.log('[Imagen I2I] Project:', projectId);

        // SELECT MODEL BASED ON MODIFICATION TYPE
        const location = 'us-central1';
        let model = process.env.IMAGEN_I2I_MODEL || 'imagegeneration@006'; // Default General

        if (modificationType === 'detail') {
            // Use Capability model for detail editing
            model = process.env.IMAGEN_CAPABILITY_MODEL || 'imagen-3.0-capability-001';
            console.log('[Imagen I2I] DETAIL mode selected -> Switching to Capability model');
        } else {
            // Use Generate model for general renovation
            console.log('[Imagen I2I] RENOVATION mode selected -> Using General model');
        }

        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

        console.log('[Imagen I2I] Using model:', model);

        // API request payload for image-to-image editing

        // Convert HTTPS URL to GS URI if possible (preferred by Vertex AI)
        let imageUri = referenceImage;
        if (referenceImage.startsWith('https://storage.googleapis.com/')) {
            // Format: https://storage.googleapis.com/BUCKET_NAME/PATH
            const pathParts = referenceImage.replace('https://storage.googleapis.com/', '').split('/');
            const bucket = pathParts.shift();
            const path = pathParts.join('/');
            if (bucket && path) {
                imageUri = `gs://${bucket}/${path}`;
                console.log('[Imagen I2I] Converted URL to GS URI:', imageUri);
            }
        }

        const isCapabilityModel = model.includes('capability');
        const isImagen3Generate = model.includes('imagen-3.0-generate');

        // ✅ QUALITY WRAPPER: Hardcoded parameters for maximum quality
        const parameters: any = {
            sampleCount: numberOfImages,
            // aspectRatio is not supported in I2I mode for some models (inherit from source)
            safetySetting: 'block_some',
            personGeneration: 'allow_adult',

            // ✅ NEW: Negative prompt to prevent distortions and artifacts
            negativePrompt: 'blurry, distorted, low resolution, cartoon, painting, melted objects, ' +
                'bad perspective, floating structures, noise, ugly, deformed, watermark, ' +
                'text overlay, amateur, sketch, low quality, pixelated',
        };

        // Strict Payload Logic based on Model Type
        if (isCapabilityModel) {
            // Capability models (editing) require editConfig
            parameters.editConfig = {
                editMode: mode,
                maskMode: maskMode,
            };
        } else if (isImagen3Generate) {
            // Imagen 3 Generate (Standard I2I) - STRICTLY NO editConfig
            console.log('[Imagen I2I] Imagen 3 Generate detected - Using CLEAN payload with negative prompt');
        } else {
            // Legacy/Standard models (Imagen 2) - Standard payload
            console.log('[Imagen I2I] Legacy/Standard Model detected - skipping editConfig');
        }

        const requestPayload = {
            instances: [
                {
                    prompt: prompt,
                    image: {
                        gcsUri: imageUri, // gs:// URL preferred
                    }
                }
            ],
            parameters: parameters
        };

        // ✅ LOGGING FOR USER DEBUGGING (Excluding large image data if present)
        console.log('--- [DEBUG] IMAGEN API PAYLOAD ---');
        console.log('Model:', model);
        console.log('Endpoint:', endpoint);
        console.log('Payload:', JSON.stringify({
            instances: requestPayload.instances.map(inst => ({
                ...inst,
                // Truncate image data if it were base64 for cleaner logs
                image: inst.image?.gcsUri ? inst.image : '{base64_data_hidden}'
            })),
            parameters: requestPayload.parameters
        }, null, 2));
        console.log('--- [DEBUG] END PAYLOAD ---');

        console.log('[Imagen I2I] Calling API with editMode:', mode, 'maskMode:', maskMode);

        // Make REST API call
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Imagen I2I] API Error:', response.status, errorText);

            // Check if it's a 404/403 (model not available) and suggest fallback
            if (response.status === 404 || response.status === 403) {
                console.warn('[Imagen I2I] Capability model not available, trying fallback...');

                // Try fallback to Imagen 2.0 if available
                if (process.env.I2I_FALLBACK_MODEL) {
                    console.log('[Imagen I2I] Attempting fallback to:', process.env.I2I_FALLBACK_MODEL);
                    // Note: Fallback model requires manual configuration in environment variables
                    return await generateInteriorImageI2I({
                        ...options,
                    });
                }

                throw new Error('Image editing is not available for your account. Please contact support.');
            }

            // Expose the real error for debugging
            throw new Error(`Imagen API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('[Imagen I2I] API Response received');

        // Extract base64 image from response
        if (!result.predictions || result.predictions.length === 0) {
            throw new Error('No image generated');
        }

        // Imagen returns base64 encoded image in predictions[0].bytesBase64Encoded
        const base64Image = result.predictions[0].bytesBase64Encoded;

        if (!base64Image) {
            console.error('[Imagen I2I] Response structure:', JSON.stringify(result, null, 2));
            throw new Error('No image data in response');
        }

        // Convert base64 to Buffer
        const imageBuffer = Buffer.from(base64Image, 'base64');

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Imagen I2I] Image edited in ${elapsedTime}s`);
        console.log(`[Imagen I2I] Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

        return imageBuffer;

    } catch (error) {
        console.error('[Imagen I2I] Error:', error);

        // User-friendly error messages (don't expose internal details)
        if (error instanceof Error) {
            // Log detailed error for debugging
            console.error('[Imagen I2I] Detailed error:', error.message, error.stack);

            if (error.message.includes('403')) {
                throw new Error('Image editing service is currently unavailable. Please try again later.');
            }

            if (error.message.includes('404')) {
                throw new Error('Image editing service is currently unavailable. Please try again later.');
            }

            // Allow API errors to propagate for debugging
            if (error.message.includes('Imagen API error')) {
                throw error;
            }
        }

        // Generic user-friendly message
        throw new Error('Image editing failed. Please try again in a few moments.');
    }
}

/**
 * Build enhanced prompt for image-to-image editing
 * Optimized for preserving structural elements while changing style
 * ENHANCED: Quality Wrapper with mandatory Style Booster
 */
export function buildI2IEditingPrompt(options: {
    userPrompt: string;
    structuralElements?: string;
    roomType: string;
    style: string;
}): string {
    const { userPrompt, structuralElements, roomType, style } = options;

    // ✅ MANDATORY STYLE BOOSTER: Injected into every prompt for max quality
    const STYLE_BOOSTER = ', photorealistic 8k, highly detailed, architectural photography, ' +
        'sharp focus, raytracing lighting, physically based rendering, ' +
        'professional interior design portfolio';

    // If we have structural elements, emphasize preservation
    const structuralInstruction = structuralElements
        ? `STRICTLY PRESERVE THE ARCHITECTURAL STRUCTURE AND LAYOUT: ${structuralElements}. `
        : '';

    // ✅ QUALITY WRAPPER: Every prompt gets the booster appended
    const enhancedPrompt = `
${structuralInstruction}
Task: Professional total renovation of this ${roomType} into a high-end ${style} design.
User request: ${userPrompt}

Instructions:
- Keep the exact position of windows, doors, and walls.
- Replace all materials, textures, and furniture with premium ${style} alternatives.
- Use realistic lighting (natural sunlight through windows + interior ambient lighting).
- Quality requirements: ${STYLE_BOOSTER}
    `.trim();

    console.log('[I2I Prompt] Style Booster injected:', STYLE_BOOSTER);
    return enhancedPrompt;
}
