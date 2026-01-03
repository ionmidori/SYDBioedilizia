module.exports = [
"[project]/ai_core/src/vision/analyze-room.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "analyzeRoomStructure",
    ()=>analyzeRoomStructure
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@google/generative-ai/dist/index.mjs [app-route] (ecmascript)");
;
async function analyzeRoomStructure(imageUrl) {
    const startTime = Date.now();
    console.log('[Vision] Initializing Gemini Vision analysis...');
    console.log('[Vision] Image URL:', imageUrl);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found in environment variables');
    }
    const genAI = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["GoogleGenerativeAI"](apiKey);
    // Configurable model with fallback
    const modelVersion = process.env.VISION_MODEL_VERSION || 'gemini-3-pro-image-preview';
    const model = genAI.getGenerativeModel({
        model: modelVersion
    });
    // Structured analysis prompt
    const analysisPrompt = `You are a professional interior designer and architect. Analyze this interior photo and extract precise structural and architectural information.

Return ONLY a valid JSON object with this EXACT structure (no markdown, no explanation):

{
    "room_type": "living_room|bedroom|kitchen|bathroom|dining_room|office",
    "approximate_size_sqm": 25,
    "architectural_features": [
        "wooden staircase on left wall corner",
        "stone-clad fireplace centered on back wall",
        "slanted ceiling with exposed beams"
    ],
    "flooring_type": "terracotta tiles|hardwood|marble|carpet|concrete|laminate",
    "wall_color": "white|beige|gray|cream|...",
    "ceiling_type": "flat|sloped|vaulted|exposed_beams",
    "windows": [
        {"position": "right wall center", "size": "large|medium|small"}
    ],
    "doors": [
        {"position": "back wall left"}
    ],
    "special_features": ["fireplace", "staircase", "built-in_shelving", "exposed_brick"]
}

CRITICAL RULES:
1. Be EXTREMELY precise about positions: use "left wall", "right wall", "center", "back wall", "corner"
2. Include ALL visible architectural elements
3. Be specific about materials (e.g., "terracotta tiles" not just "tiles")
4. Return ONLY the JSON object, nothing else
5. Ensure the JSON is valid and parseable`;
    try {
        // Fetch image and convert to base64
        console.log('[Vision] Fetching and converting image...');
        const { data: imageData, mimeType } = await fetchImageAsBase64(imageUrl);
        const imagePart = {
            inlineData: {
                data: imageData,
                mimeType: mimeType
            }
        };
        const TIMEOUT_MS = 30000; // 30 seconds timeout
        const timeoutPromise = new Promise((_, reject)=>setTimeout(()=>reject(new Error('Vision API request timed out')), TIMEOUT_MS));
        console.log('[Vision] Sending request to Gemini Vision API...');
        // Race between API call and timeout
        const result = await Promise.race([
            model.generateContent([
                analysisPrompt,
                imagePart
            ]),
            timeoutPromise
        ]); // Cast to any because Promise.race returns the first resolved type
        const responseText = result.response.text();
        console.log('[Vision] Raw response:', responseText.substring(0, 200) + '...');
        // Extract JSON from response (handle potential markdown wrapping)
        let jsonText = responseText.trim();
        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        // Find JSON object in response
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[Vision] Failed to extract JSON from response:', responseText);
            throw new Error('Failed to parse room analysis - no JSON found in response');
        }
        let analysis;
        try {
            analysis = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('[Vision] JSON Parse Error:', parseError);
            throw new Error('Failed to parse (syntax error) in Vision API response');
        }
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Vision] ✅ Analysis complete in ${elapsedTime}s`);
        console.log('[Vision] Analyzed room:', JSON.stringify(analysis, null, 2));
        // Validation - Robust check of all required fields
        if (typeof analysis.room_type !== 'string' || typeof analysis.approximate_size_sqm !== 'number' || !Array.isArray(analysis.architectural_features) || typeof analysis.flooring_type !== 'string' || typeof analysis.wall_color !== 'string' || typeof analysis.ceiling_type !== 'string' || !Array.isArray(analysis.windows) || !Array.isArray(analysis.doors)) {
            console.error('[Vision] Validation Failed. Received:', analysis);
            throw new Error('Invalid analysis result - missing required fields or incorrect types');
        }
        return analysis;
    } catch (error) {
        console.error('[Vision] Error during analysis:', error);
        if (error instanceof Error) {
            if (error.message.includes('API key')) {
                throw new Error('Gemini API authentication failed. Check GEMINI_API_KEY.');
            }
            if (error.message.includes('quota')) {
                throw new Error('Gemini API quota exceeded. Try again later.');
            }
        }
        throw error;
    }
}
/**
 * Fetch image from URL and convert to base64 with MIME type detection
 * @param url - Public HTTPS URL of the image
 * @returns Object containing base64 data and mimeType
 */ async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        console.log(`[Vision] Image fetched: ${(buffer.length / 1024).toFixed(2)} KB, Type: ${mimeType}`);
        return {
            data: base64,
            mimeType
        };
    } catch (error) {
        console.error('[Vision] Error fetching image:', error);
        throw new Error(`Failed to fetch image from URL: ${url}`);
    }
}
}),
"[externals]/child_process [external] (child_process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("child_process", () => require("child_process"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("os", () => require("os"));

module.exports = mod;
}),
"[externals]/events [external] (events, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("events", () => require("events"));

module.exports = mod;
}),
"[externals]/process [external] (process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("process", () => require("process"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/querystring [external] (querystring, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("querystring", () => require("querystring"));

module.exports = mod;
}),
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[project]/ai_core/src/imagen/generate-interior.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildInteriorDesignPrompt",
    ()=>buildInteriorDesignPrompt,
    "generateInteriorImage",
    ()=>generateInteriorImage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$google$2d$auth$2d$library$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/google-auth-library/build/src/index.js [app-route] (ecmascript)");
;
async function generateInteriorImage(options) {
    const { prompt, aspectRatio = '16:9', numberOfImages = 1 } = options;
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
        const auth = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$google$2d$auth$2d$library$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["GoogleAuth"]({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey,
                project_id: projectId
            },
            scopes: [
                'https://www.googleapis.com/auth/cloud-platform'
            ]
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
        const model = process.env.IMAGEN_MODEL_VERSION || 'imagen-4.0-generate-001';
        const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
        // API request payload
        const requestPayload = {
            instances: [
                {
                    prompt: prompt
                }
            ],
            parameters: {
                sampleCount: numberOfImages,
                aspectRatio: aspectRatio,
                safetySetting: 'block_some',
                personGeneration: 'allow_adult'
            }
        };
        console.log('[Imagen REST] Calling API...');
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(()=>controller.abort(), 60000); // 60s timeout
        // Make REST API call
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal
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
function buildInteriorDesignPrompt(options) {
    const { userPrompt, roomType, style } = options;
    const enhancedPrompt = `
Photorealistic interior design rendering of a ${roomType}.
Style: ${style}.
${userPrompt}

Professional architectural visualization quality with natural lighting, realistic materials and textures, proper perspective, modern high-end interior design, clean composition, 4K quality.
    `.trim();
    return enhancedPrompt;
}
}),
"[project]/ai_core/src/imagen/prompt-builders.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildFallbackPrompt",
    ()=>buildFallbackPrompt,
    "buildPromptFromRoomAnalysis",
    ()=>buildPromptFromRoomAnalysis
]);
function buildPromptFromRoomAnalysis(analysis, targetStyle, userRequest) {
    console.log('[Prompt Builder] Building detailed T2I prompt from analysis...');
    // Helper for formatting lists
    const formatList = (items, formatter, emptyText = '')=>items && items.length > 0 ? items.map(formatter).join('\n') : emptyText;
    // Format architectural features
    const features = formatList(analysis.architectural_features, (f)=>`- ${f}`);
    // Format windows
    const windowsDescription = formatList(analysis.windows, (w)=>`- ${w.size} window on ${w.position}`, '- No visible windows');
    // Format doors
    const doorsDescription = formatList(analysis.doors, (d)=>`- Door on ${d.position}`);
    // Format special features
    const specialFeaturesList = formatList(analysis.special_features, (f)=>`- ${f}`);
    const specialFeatures = specialFeaturesList ? `\nSpecial architectural elements:\n${specialFeaturesList}` : '';
    // Build comprehensive prompt
    const detailedPrompt = `
Professional architectural photography of a ${analysis.room_type}, approximately ${analysis.approximate_size_sqm} square meters.

ARCHITECTURAL LAYOUT (MUST PRESERVE EXACTLY):
${features}

Windows:
${windowsDescription}

${doorsDescription ? `Doors:\n${doorsDescription}\n` : ''}
Flooring: ${analysis.flooring_type}
Walls: ${analysis.wall_color}
Ceiling: ${analysis.ceiling_type}${specialFeatures}

DESIGN TRANSFORMATION:
Style: ${targetStyle}
User request: ${userRequest}

STRICT REQUIREMENTS:
- Preserve the EXACT architectural layout described above
- Keep all structural elements in their specified positions
- Maintain the same room dimensions and proportions
- Change ONLY: furniture, decorative elements, material textures, colors, lighting fixtures
- Do NOT move or alter: windows, doors, stairs, fireplace, built-in features
- Quality: Photorealistic, 8K resolution, architectural magazine quality
- Lighting: Natural sunlight through windows + ambient interior lighting
- Style: High-end professional interior design
- Perspective: Proper architectural perspective, sharp focus throughout
- Rendering: Physically based rendering, ray-traced reflections, realistic materials
    `.trim();
    console.log('[Prompt Builder] Generated prompt length:', detailedPrompt.length, 'characters');
    // Log a preview
    const preview = detailedPrompt.substring(0, 200) + '...';
    console.log('[Prompt Builder] Preview:', preview);
    return detailedPrompt;
}
function buildFallbackPrompt(roomType, style, userRequest) {
    return `
Professional ${style} style ${roomType}.
${userRequest}
Photorealistic, 8K, architectural photography, high-end interior design, natural lighting.
    `.trim();
}
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/ai_core/src/chat-tools.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Tool definitions for chat API
__turbopack_context__.s([
    "createChatTools",
    ()=>createChatTools
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$ai$2d$sdk$2f$provider$2d$utils$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@ai-sdk/provider-utils/dist/index.mjs [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-route] (ecmascript) <export * as z>");
(()=>{
    const e = new Error("Cannot find module '@/lib/imagen/generate-interior'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
(()=>{
    const e = new Error("Cannot find module '@/lib/vision/analyze-room'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
(()=>{
    const e = new Error("Cannot find module '@/lib/imagen/prompt-builders'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
;
;
;
;
;
function createChatTools(sessionId) {
    // Define schemas first - ✅ CHAIN OF THOUGHT: Forza l'AI a riflettere sulla struttura prima del prompt
    const GenerateRenderParameters = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        // 1️⃣ STEP 1: Analizza la struttura (Chain of Thought)
        structuralElements: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(20).describe('MANDATORY: List ALL structural elements visible in the user photo or mentioned in the request (in ENGLISH). ' + 'Examples: "arched window on left wall", "exposed wooden ceiling beams", "parquet flooring", "high ceilings 3.5m". ' + 'If no photo was uploaded, describe the structural requests from the conversation (e.g., "large kitchen island", "walk-in shower").'),
        // 2️⃣ STEP 2: Type & Style (già esistenti)
        roomType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(3).describe('MANDATORY: Type of room in ENGLISH (e.g. "kitchen", "bathroom").'),
        style: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(3).describe('MANDATORY: Design style in ENGLISH (e.g. "industrial", "modern").'),
        // 3️⃣ STEP 3: Prompt finale (DEVE usare structuralElements)
        prompt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(30).describe('MANDATORY: The final detailed prompt for the image generator IN ENGLISH. ' + 'MUST start by describing the structuralElements listed above. ' + 'Example: "A modern living room featuring a large arched window on the left wall, exposed wooden beams on the ceiling, and oak parquet flooring. The space includes..."'),
        // 🆕 HYBRID TOOL PARAMETERS (Optional - backward compatible)
        // 4️⃣ Mode selection (creation vs modification)
        mode: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
            'creation',
            'modification'
        ]).optional().default('creation').describe('Choose "modification" if user uploaded a photo and wants to transform that specific room. ' + 'Choose "creation" if user is describing an imaginary room from scratch. ' + 'DEFAULT: "creation" if not specified.'),
        // 5️⃣ Source image URL (required for modification mode)
        sourceImageUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().url().optional().describe('REQUIRED if mode="modification". The public HTTPS URL of the uploaded user photo (from Firebase Storage). ' + 'Search conversation history for URLs like "https://storage.googleapis.com/...". ' + 'If user uploaded a photo but you cannot find the URL, ask them to re-upload. ' + 'Leave empty for mode="creation".'),
        // 6️⃣ Modification Type (for model selection)
        modificationType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
            'renovation',
            'detail'
        ]).optional().default('renovation').describe('Choose "renovation" for whole-room transformation (default). ' + 'Choose "detail" for small edits (e.g., "change sofa color", "add plant"). ' + 'This selects the appropriate AI model.')
    });
    const SubmitLeadParameters = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().max(100).describe('Customer name'),
        email: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().email().max(200).describe('Customer email'),
        phone: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().max(20).optional().describe('Customer phone number'),
        projectDetails: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().max(2000).describe('Detailed project description'),
        roomType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().max(100).optional().describe('Type of room'),
        style: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().max(100).optional().describe('Preferred style')
    });
    return {
        generate_render: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$ai$2d$sdk$2f$provider$2d$utils$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["tool"])({
            description: `Generate a photorealistic 3D rendering of an interior design.
            
            IMPORTANT CONFIRMATION RULE:
            DO NOT call without confirmation! First summarize collected details and ask: "Vuoi che proceda con la generazione?"
            
            CRITICAL - AFTER THIS TOOL RETURNS:
            You MUST include the returned imageUrl in your next response using markdown format.
            Example: "Ecco il rendering!\\n\\n![](RETURNED_IMAGE_URL)\\n\\nTi piace?"
            
            The imageUrl will be in the tool result under result.imageUrl - you MUST display it with ![](url) syntax.`,
            parameters: GenerateRenderParameters,
            execute: async (args)=>{
                // Extract all parameters including new hybrid parameters
                const { prompt, roomType, style, structuralElements, mode, sourceImageUrl, modificationType } = args || {};
                try {
                    // Use sessionId from closure (injected via factory)
                    console.log('🏗️ [Chain of Thought] Structural elements detected:', structuralElements);
                    console.log('🛠️ [Hybrid Tool] Mode selected:', mode || 'creation (default)');
                    console.log('🔧 [Hybrid Tool] Modification Type:', modificationType || 'renovation (default)');
                    console.log('🎨 [generate_render] RECEIVED ARGS:', {
                        prompt,
                        roomType,
                        style,
                        mode,
                        hasSourceImage: !!sourceImageUrl
                    });
                    const safeRoomType = (roomType || 'room').substring(0, 100);
                    const safeStyle = (style || 'modern').substring(0, 100);
                    // FAILSAFE: If prompt is empty/short, regenerate it
                    let safePrompt = prompt || `Interior design of a ${safeRoomType} in ${safeStyle} style`;
                    if (safePrompt.length < 10) {
                        console.warn('⚠️ [Failsafe] Short prompt detected, regenerating...');
                        safePrompt = `${safeStyle} style ${safeRoomType} with ${structuralElements || 'modern design'}`;
                    }
                    console.log('🔥 [generate_render] Safe Prompt used:', safePrompt);
                    // 🔀 ROUTING LOGIC: Choose T2I (creation) or I2I (modification)
                    let imageBuffer;
                    let enhancedPrompt;
                    const actualMode = mode || 'creation'; // Default to creation for backward compatibility
                    // 🔍 DEBUG LOGGING
                    console.log('🔍 [DEBUG] actualMode:', actualMode);
                    console.log('🔍 [DEBUG] sourceImageUrl:', sourceImageUrl);
                    console.log('🔍 [DEBUG] mode param:', mode);
                    console.log('🔍 [DEBUG] Condition met?', actualMode === 'modification' && sourceImageUrl);
                    if (actualMode === 'modification' && sourceImageUrl) {
                        try {
                            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            // 📸 PHOTO-BASED RENOVATION: Vision Analysis → T2I
                            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            console.log('[Vision] 📸 PHOTO-BASED MODE: Analyzing with Gemini Vision → T2I');
                            console.log('[Vision] Reference photo:', sourceImageUrl);
                            // Step 1: Analyze room structure with Gemini Vision
                            console.log('[Vision] Step 1: Analyzing room structure...');
                            const roomAnalysis = await analyzeRoomStructure(sourceImageUrl);
                            console.log('[Vision] ✅ Analysis complete');
                            console.log('[Vision] Detected:', roomAnalysis.room_type, `(~${roomAnalysis.approximate_size_sqm}sqm)`);
                            console.log('[Vision] Features:', roomAnalysis.architectural_features.join(', '));
                            // Step 2: Build super-detailed prompt from Vision analysis
                            enhancedPrompt = buildPromptFromRoomAnalysis(roomAnalysis, safeStyle, safePrompt);
                            console.log('[Vision] Step 2: Generating with T2I using Vision-guided prompt');
                            console.log('[T2I] Prompt preview:', enhancedPrompt.substring(0, 150) + '...');
                            // Step 3: Generate with T2I (NOT I2I!)
                            imageBuffer = await generateInteriorImage({
                                prompt: enhancedPrompt,
                                aspectRatio: '16:9',
                                numberOfImages: 1
                            });
                            console.log('[T2I] ✅ Generation complete using Vision-guided T2I');
                        } catch (visionError) {
                            console.error('[Vision] ⚠️ Analysis failed, falling back to standard T2I:', visionError);
                            // FALLBACK: Use standard T2I generation
                            console.log('[Fallback] Switching to standard Text-to-Image generation...');
                            enhancedPrompt = buildInteriorDesignPrompt({
                                userPrompt: safePrompt,
                                roomType: safeRoomType,
                                style: safeStyle
                            });
                            imageBuffer = await generateInteriorImage({
                                prompt: enhancedPrompt,
                                aspectRatio: '16:9'
                            });
                        }
                    } else {
                        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        // ✨ TEXT-TO-IMAGE CREATION MODE (existing flow - unchanged)
                        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        console.log('[Hybrid Tool] ✨ Using TEXT-TO-IMAGE generation (creation mode)');
                        console.log('[generate_render] Calling Imagen REST API...');
                        // Build enhanced prompt (existing logic)
                        enhancedPrompt = buildInteriorDesignPrompt({
                            userPrompt: safePrompt,
                            roomType: safeRoomType,
                            style: safeStyle
                        });
                        // Generate image (existing flow)
                        imageBuffer = await generateInteriorImage({
                            prompt: enhancedPrompt,
                            aspectRatio: '16:9'
                        });
                    }
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    // 📤 UPLOAD TO FIREBASE STORAGE (common for both modes)
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    // ✅ BUG FIX #7: Validate image buffer before upload
                    if (!imageBuffer || imageBuffer.length === 0) {
                        throw new Error('Generated image is empty or invalid');
                    }
                    const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit
                    if (imageBuffer.length > maxSizeBytes) {
                        throw new Error(`Generated image is too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 10MB)`);
                    }
                    console.log(`[generate_render] Image validated: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
                    // Upload to Firebase Storage with session-scoped path
                    const { storage } = await __turbopack_context__.A("[project]/web_client/lib/firebase-admin.ts [app-route] (ecmascript, async loader)");
                    const bucket = storage().bucket();
                    // ✅ BUG FIX #2: Add unique ID to prevent race conditions
                    const timestamp = Date.now();
                    const uniqueId = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].randomUUID().split('-')[0]; // First segment for brevity
                    const fileName = `renders/${sessionId}/${timestamp}-${uniqueId}-${safeRoomType.replace(/\s+/g, '-')}.png`;
                    const file = bucket.file(fileName);
                    await file.save(imageBuffer, {
                        contentType: 'image/png',
                        metadata: {
                            cacheControl: 'public, max-age=31536000'
                        }
                    });
                    // Generate Signed URL (valid for 7 days)
                    // This replaces makePublic() for better security
                    const [signedUrl] = await file.getSignedUrl({
                        action: 'read',
                        expires: Date.now() + 7 * 24 * 60 * 60 * 1000
                    });
                    const imageUrl = signedUrl;
                    console.log('[generate_render] ✅ Image uploaded (secure signed URL):', imageUrl.substring(0, 50) + '...');
                    // Return URL directly - Gemini will receive this and include it in response
                    return {
                        status: 'success',
                        imageUrl,
                        description: `Rendering ${safeStyle} per ${safeRoomType}`,
                        promptUsed: enhancedPrompt
                    };
                } catch (error) {
                    console.error('[generate_render] Error:', error);
                    return {
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Image generation failed'
                    };
                }
            }
        }),
        submit_lead_data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$ai$2d$sdk$2f$provider$2d$utils$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["tool"])({
            description: 'Submit collected lead data (contact information and project details) to Firestore',
            parameters: SubmitLeadParameters,
            execute: async (data)=>{
                try {
                    console.log('[submit_lead_data] Saving lead to Firestore:', data);
                    const { db } = await __turbopack_context__.A("[project]/web_client/lib/firebase-admin.ts [app-route] (ecmascript, async loader)");
                    const firestore = db();
                    await firestore.collection('leads').add({
                        ...data,
                        createdAt: new Date().toISOString(),
                        source: 'chatbot',
                        status: 'new'
                    });
                    console.log('[submit_lead_data] ✅ Lead saved successfully');
                    return {
                        success: true,
                        message: 'Dati salvati con successo! Ti contatteremo presto.'
                    };
                } catch (error) {
                    console.error('[submit_lead_data] Error:', error);
                    return {
                        success: false,
                        message: 'Errore nel salvataggio dei dati.'
                    };
                }
            }
        })
    };
}
}),
"[project]/ai_core/src/ai-retry.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "callAIWithRetry",
    ()=>callAIWithRetry
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/ai/dist/index.mjs [app-route] (ecmascript) <locals>");
;
/**
 * ✅ CRITICAL FIX #3: AI timeout and rate limit handling
 * Helper function to call AI with retry logic and timeout
 */ const MAX_RETRIES = 2;
const TIMEOUT_MS = 45000; // 45 seconds
async function callAIWithRetry(config, retries = 0) {
    try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(()=>controller.abort(), TIMEOUT_MS);
        const streamPromise = Promise.resolve().then(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["streamText"])({
                ...config,
                abortSignal: controller.signal
            }));
        const result = await Promise.race([
            streamPromise,
            new Promise((_, reject)=>setTimeout(()=>reject(new Error('AI_TIMEOUT')), TIMEOUT_MS))
        ]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        // Handle timeout errors
        if (error.message === 'AI_TIMEOUT' && retries < MAX_RETRIES) {
            console.warn(`[AI] Timeout, retrying (${retries + 1}/${MAX_RETRIES})`);
            await new Promise((resolve)=>setTimeout(resolve, 1000 * (retries + 1)));
            return callAIWithRetry(config, retries + 1);
        }
        // Handle rate limit (429) errors
        if (error.status === 429 && retries < MAX_RETRIES) {
            const retryAfter = parseInt(error.headers?.['retry-after'] || '5');
            console.warn(`[AI] Rate limited, waiting ${retryAfter}s before retry`);
            await new Promise((resolve)=>setTimeout(resolve, retryAfter * 1000));
            return callAIWithRetry(config, retries + 1);
        }
        // Throw user-friendly error
        if (error.status === 429) {
            throw new Error('Il servizio è temporaneamente sovraccarico. Riprova tra qualche minuto.');
        }
        if (error.message === 'AI_TIMEOUT') {
            throw new Error('La richiesta ha impiegato troppo tempo. Riprova.');
        }
        throw error;
    }
}
;
}),
"[project]/ai_core/src/index.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$vision$2f$analyze$2d$room$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/vision/analyze-room.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/generate-interior.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$prompt$2d$builders$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/prompt-builders.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$chat$2d$tools$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/chat-tools.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$ai$2d$retry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/ai-retry.ts [app-route] (ecmascript)");
;
;
;
;
;
}),
"[project]/ai_core/src/index.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "analyzeRoomStructure",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$vision$2f$analyze$2d$room$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["analyzeRoomStructure"],
    "buildFallbackPrompt",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$prompt$2d$builders$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildFallbackPrompt"],
    "buildInteriorDesignPrompt",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildInteriorDesignPrompt"],
    "buildPromptFromRoomAnalysis",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$prompt$2d$builders$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildPromptFromRoomAnalysis"],
    "callAIWithRetry",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$ai$2d$retry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["callAIWithRetry"],
    "createChatTools",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$chat$2d$tools$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createChatTools"],
    "generateInteriorImage",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateInteriorImage"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/ai_core/src/index.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$vision$2f$analyze$2d$room$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/vision/analyze-room.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/generate-interior.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$prompt$2d$builders$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/prompt-builders.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$chat$2d$tools$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/chat-tools.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$ai$2d$retry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/ai-retry.ts [app-route] (ecmascript)");
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__3b7decd1._.js.map