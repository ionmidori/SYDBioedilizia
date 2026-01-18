import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
/**
 * Generate interior design image using Gemini Multimodal Editing (Text+Image -> Image)
 * Optimized for "Skeleton vs Skin" renovation logic.
 */
export async function generateInteriorImageI2I(options) {
    const { prompt, referenceImage, modificationType = 'renovation', } = options;
    // Logghiamo l'inizio per tracciabilità
    const startTime = Date.now();
    console.log(`[Gemini I2I] 🎨 Starting generation (${modificationType})...`);
    console.log(`[Gemini I2I] Prompt Preview: ${prompt.substring(0, 80)}...`);
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const location = 'us-central1';
        if (!projectId)
            throw new Error('Missing FIREBASE_PROJECT_ID');
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
        // Selezione modello: Usa la preview più recente per la qualità visiva
        const modelName = process.env.VISION_MODEL_VERSION || 'gemini-2.5-flash-image';
        console.log('[Gemini I2I] Using model:', modelName);
        const generativeModel = vertex_ai.getGenerativeModel({
            model: modelName,
            // 🛡️ SAFETY: Blocchiamo solo l'estremo per permettere libertà artistica
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            ],
            generationConfig: {
                maxOutputTokens: 8192,
                // 🔥 CRITICAL CHANGE: Alziamo la temperatura per permettere "Allucinazioni Controllate" (Dettagli, luci, clutter)
                // 0.2 era troppo rigido. 0.85 permette al modello di inventare texture HD.
                temperature: 0.85,
                topP: 0.95,
                topK: 40,
            }
        });
        // 1. Fetch Image
        console.log('[Gemini I2I] Fetching reference image...');
        const { data: base64Image, mimeType } = await fetchImageAsBase64(referenceImage);
        // 2. System Instruction "Skeleton vs Skin"
        // Invece di "DO NOT CHANGE", diciamo "Use as 3D Wireframe".
        const systemInstruction = `
            ROLE: High-Fidelity Interior Design Renderer.
            TASK: Renovate the input room.
            
            STRICT GEOMETRY RULES (The Skeleton):
            1. Treat the input image as a 3D WIREFRAME or CLAY MODEL.
            2. You MUST keep the exact perspective, vanishing points, and structural walls.
            3. Do not move windows or structural pillars.

            CREATIVE PERMISSIONS (The Skin):
            1. You MUST completely re-render all surfaces (floors, walls, ceilings) with new 8k textures.
            2. IGNORE the original lighting. Synthesize new cinematic studio lighting.
            3. ALLOW furniture and rugs to occlude/cover the original floor to create a realistic layout.
            4. If the room is empty, you MUST furnish it heavily ("Staging").
        `;
        // 3. Construct Request
        const request = {
            contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: mimeType, data: base64Image } }, // L'immagine va prima
                        { text: `${systemInstruction}\n\nUSER PROMPT (Visual Style): ${prompt}` } // Il prompt va dopo
                    ]
                }]
        };
        console.log('[Gemini I2I] Sending to Vertex AI...');
        const response = await generativeModel.generateContent(request);
        const result = await response.response;
        // 4. Extract Image
        if (!result.candidates || result.candidates.length === 0) {
            // Gestione errori specifica di Vertex
            console.error('[Gemini I2I] Full Response Dump:', JSON.stringify(result, null, 2));
            throw new Error('No candidates returned. Possible safety block or filter.');
        }
        const candidate = result.candidates[0];
        // Controllo Finish Reason (importante per debug)
        if (candidate.finishReason !== 'STOP') {
            console.warn(`[Gemini I2I] Warning: Finish reason is ${candidate.finishReason}`);
        }
        let generatedImageBase64;
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                generatedImageBase64 = part.inlineData.data;
                break;
            }
        }
        if (!generatedImageBase64) {
            const textResponse = candidate.content.parts.find(p => p.text)?.text;
            throw new Error(`Model generated text instead of image: "${textResponse?.substring(0, 100)}..."`);
        }
        const imageBuffer = Buffer.from(generatedImageBase64, 'base64');
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Gemini I2I] ✅ Success! Generated ${(imageBuffer.length / 1024).toFixed(2)} KB in ${elapsedTime}s`);
        return imageBuffer;
    }
    catch (error) {
        console.error('[Gemini I2I] ❌ Generation Failed:', error);
        // Error Mapping per facilitare il debug
        if (error.message?.includes('429'))
            throw new Error('Quota esaurita su Vertex AI (Rate Limit).');
        if (error.message?.includes('400'))
            throw new Error('Immagine non valida o prompt troppo lungo.');
        throw error;
    }
}
// Helper per il fetch (Invariato, ma essenziale)
async function fetchImageAsBase64(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Failed to fetch image: ${response.status}`);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    return { data: Buffer.from(arrayBuffer).toString('base64'), mimeType };
}
// Prompt Builder aggiornato per il nuovo approccio
export function buildI2IEditingPrompt(options) {
    const { userPrompt, structuralElements, roomType, style } = options;
    // Qui applichiamo il "Golden Stack" se non è stato fatto dall'Architetto
    return `
    [COMMAND]: Renovate this ${roomType} into a ${style} masterpiece.
    [CONTEXT]: Preserve structural elements: ${structuralElements || 'Main walls and windows'}.
    [DETAILS]: ${userPrompt}
    [QUALITY]: Photorealistic, 8k, Volumetric Lighting, Highly Detailed, Magazine Quality.
    `.trim();
}
