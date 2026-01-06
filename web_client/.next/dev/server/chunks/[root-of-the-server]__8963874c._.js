module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
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
    // 1. Define model in a SINGLE variable
    const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash';
    // 2. Dynamic logging
    console.log('[Vision] Initializing Gemini Vision analysis...');
    console.log(`[Vision] Model: ${modelName}`);
    console.log('[Vision] Image URL:', imageUrl);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found in environment variables');
    }
    const genAI = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["GoogleGenerativeAI"](apiKey);
    // 3. Use the variable
    const model = genAI.getGenerativeModel({
        model: modelName
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
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

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
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("path", () => require("path"));

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
        const model = process.env.IMAGEN_MODEL_VERSION || 'imagen-3.0-generate-001';
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
"[externals]/net [external] (net, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("net", () => require("net"));

module.exports = mod;
}),
"[externals]/tls [external] (tls, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("tls", () => require("tls"));

module.exports = mod;
}),
"[externals]/assert [external] (assert, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("assert", () => require("assert"));

module.exports = mod;
}),
"[externals]/tty [external] (tty, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("tty", () => require("tty"));

module.exports = mod;
}),
"[externals]/http [external] (http, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("http", () => require("http"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[externals]/punycode [external] (punycode, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("punycode", () => require("punycode"));

module.exports = mod;
}),
"[externals]/zlib [external] (zlib, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("zlib", () => require("zlib"));

module.exports = mod;
}),
"[externals]/node:events [external] (node:events, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:events", () => require("node:events"));

module.exports = mod;
}),
"[externals]/node:process [external] (node:process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:process", () => require("node:process"));

module.exports = mod;
}),
"[externals]/node:util [external] (node:util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:util", () => require("node:util"));

module.exports = mod;
}),
"[project]/ai_core/src/vision/architect.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateArchitecturalPrompt",
    ()=>generateArchitecturalPrompt
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2d$cloud$2f$vertexai$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@google-cloud/vertexai/build/src/index.js [app-route] (ecmascript)");
;
async function generateArchitecturalPrompt(imageBuffer, targetStyle, keepElements = []) {
    // 1. Define model in a SINGLE variable
    const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash';
    // 2. Dynamic logging (now tells the truth)
    console.log(`[Architect] Analyzing geometry to build Locked Prompt (Style: ${targetStyle}, Keep: ${keepElements.length})...`);
    console.log(`[Architect] Model: ${modelName} (Vertex AI)`);
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const location = 'us-central1';
    if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID not found');
    }
    // Initialize Vertex AI with explicit auth support for local dev (Same as generator.ts)
    const vertexAI = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2d$cloud$2f$vertexai$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["VertexAI"]({
        project: projectId,
        location: location,
        googleAuthOptions: process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? {
            credentials: {
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            }
        } : undefined
    });
    // 3. Use the variable
    const model = vertexAI.getGenerativeModel({
        model: modelName
    });
    const base64Image = imageBuffer.toString('base64');
    // Preservation Logic Injection
    const preservationList = keepElements.length > 0 ? keepElements.join(', ') : "None specified (preserve structural shell only)";
    const systemPrompt = `
    ROLE: High-End Interior Renovation Architect & Prompt Engineer.
    
    GOAL: Write a generation prompt for Gemini 3 (Nano Banana) to renovate the input room based on style: "${targetStyle}".

    --- PHASE 1: STRUCTURAL ANALYSIS (THE "SKELETON") ---
    1.  **Perspective Lock (CRITICAL):** You MUST maintain the exact camera angle, focal length, and vanishing points. The 3D volume of the room is sacred.
    2.  **Wall/Window Logic:** * Unless the user EXPLICITLY asks to remove a wall ("open space", "demolish"), keep the wall positions fixed.
        * HOWEVER, you are FREE to change the *surface materials* of these walls (e.g., paint, wallpaper, brick, wood paneling).
    3.  **STRICT PRESERVATION (User Constraints):** 
        * The user has explicitly identified these elements to KEEP: [${preservationList}].
        * You MUST write negative constraints or clear instructions to ensure these specific objects remain UNTOUCHED.

    --- PHASE 2: FURNISHING RULES (THE "OCCLUSION PERMISSION") ---
    * **Override Rule:** Furniture, rugs, and decor are ALLOWED and ENCOURAGED to cover/occlude the original floors and walls.
    * **No Floating:** Objects must sit firmly on the ground.
    * **Infilling:** If the room looks empty, you MUST invent furniture to fill the void consistent with the requested style.

    --- PHASE 3: STYLING & ATMOSPHERE (THE "CLUTTER") ---
    To achieve "Magazine Quality" realism, you must instruct the generator to add:
    1.  **Layering:** Rugs on floors, throws on sofas, pillows on chairs.
    2.  **Lived-in Details ("Clutter"):** Coffee cups, open books, magazines, remote controls, vases with imperfections.
    3.  **Verticality:** Floor lamps, tall indoor trees (Ficus/Olive), hanging pendant lights.
    4.  **Foreground Depth:** Suggest placing an out-of-focus element (like a plant leaf or chair back) in the immediate foreground.

    --- PHASE 4: PROMPT ENGINEERING (THE "GOLDEN STACK") ---
    You act as a world-class Prompt Engineer. You must format the final output using this specific professional structure to trigger high-fidelity generation:

    Structure (CRITICAL ORDER):
    "[COMMAND] + [SUBJECT] + [PRESERVE]"

    MANDATORY KEYWORDS TO INCLUDE (Pick relevant ones):
    * **Lighting:** "Volumetric lighting", "Global illumination", "Cinematic soft light", "God rays from window", "Ambient occlusion".
    * **Realism:** "Photorealistic", "8k resolution", "Unreal Engine 5 render", "Archdaily photography", "Architectural Digest style", "Hyper-detailed textures".
    * **Camera:** "24mm wide angle lens", "f/8 aperture", "Depth of field", "Sharp focus".

    --- FINAL OUTPUT INSTRUCTION ---
    Write ONLY the final generation prompt string. Do not write explanations.
    
    YOU MUST START WITH THIS EXACT COMMAND (verbatim):
    "[COMMAND]: IGNORE the original image's lighting, shadows, and bad quality. Treat the input image ONLY as a loose 3D wireframe. You MUST synthesize completely NEW studio-quality lighting. REPLACE all textures."
    
    THEN provide the [SUBJECT] description (photorealistic description of the room, style, furniture, staging, clutter, lighting details, camera specs).
    
    END with [PRESERVE] constraints (what must remain untouched: [${preservationList}]).
    
    Example structure:
    "[COMMAND]: IGNORE the original image's lighting, shadows, and bad quality. Treat the input image ONLY as a loose 3D wireframe. You MUST synthesize completely NEW studio-quality lighting. REPLACE all textures. [SUBJECT]: A photorealistic wide-angle shot of a Modern Rustic living room... [STAGING]: heavily furnished... [LIGHTING]: Soft morning sunlight... [TECH]: 8k, Unreal Engine... [PRESERVE]: Absolutely keep [${preservationList}]."
  `;
    try {
        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                data: base64Image,
                                mimeType: 'image/jpeg'
                            }
                        },
                        {
                            text: systemPrompt
                        }
                    ]
                }
            ]
        });
        const generatedPrompt = result.response.candidates?.[0].content.parts[0].text;
        if (!generatedPrompt) {
            // Fallback di sicurezza se Gemini è muto
            return `A photorealistic renovation of a room in ${targetStyle} style, maintaining perspective but fully furnished. Preserve: ${preservationList}.`;
        }
        console.log('[Architect] 🔒 High-End Prompt Generated (Vertex AI)');
        console.log('[Architect] 🔒 High-End Prompt Generated (Vertex AI):');
        console.log(generatedPrompt);
        return generatedPrompt;
    } catch (error) {
        console.error("[Architect] Error:", error);
        return `${targetStyle}, photorealistic, 8k, maintain perspective. Preserve: ${preservationList}.`;
    }
}
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
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/generate-interior.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$vision$2f$architect$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/vision/architect.ts [app-route] (ecmascript)");
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
        ]).optional().default('renovation').describe('Choose "renovation" for whole-room transformation (default). ' + 'Choose "detail" for small edits (e.g., "change sofa color", "add plant"). ' + 'This selects the appropriate AI model.'),
        // 7️⃣ Elements to Keep (Crucial for JIT)
        keepElements: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()).optional().default([]).describe('List of specific structural or furniture elements the user explicitly asked to PRESERVE/KEEP. ' + 'Examples: ["terracotta floor", "fireplace", "wooden beams", "staircase"]. ' + 'This is CRITICAL for the "Modification" mode to ensure these objects remain untouched.')
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
                const { prompt, roomType, style, structuralElements, mode, sourceImageUrl, modificationType, keepElements } = args || {};
                try {
                    // Use sessionId from closure (injected via factory)
                    console.log('🏗️ [Chain of Thought] Structural elements detected:', structuralElements);
                    console.log('🛠️ [Hybrid Tool] Mode selected:', mode || 'creation (default)');
                    console.log('🔧 [Hybrid Tool] Modification Type:', modificationType || 'renovation (default)');
                    console.log('🛡️ [Hybrid Tool] KEEP ELEMENTS:', keepElements);
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
                    let triageResult = null; // Lifted scope for persistence
                    const actualMode = mode || 'creation'; // Default to creation for backward compatibility
                    // 🔍 DEBUG LOGGING
                    console.log('🔍 [DEBUG] actualMode:', actualMode);
                    console.log('🔍 [DEBUG] sourceImageUrl:', sourceImageUrl);
                    console.log('🔍 [DEBUG] mode param:', mode);
                    console.log('🔍 [DEBUG] Condition met?', actualMode === 'modification' && sourceImageUrl);
                    if (actualMode === 'modification' && sourceImageUrl) {
                        try {
                            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            // 📸 NEW JIT PIPELINE: Triage -> Architect -> Painter
                            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            console.log('[Vision] 📸 STARTING JIT PIPELINE');
                            // 1. Fetch the image buffer
                            const imageResponse = await fetch(sourceImageUrl);
                            if (!imageResponse.ok) throw new Error(`Failed to fetch source image: ${imageResponse.statusText}`);
                            const arrayBuffer = await imageResponse.arrayBuffer();
                            imageBuffer = Buffer.from(arrayBuffer); // Assign to outer variable
                            // 2. Triage (Analysis)
                            console.log('[JIT] Step 1: Triage analysis...');
                            const { analyzeImageForChat } = await __turbopack_context__.A("[project]/ai_core/src/vision/triage.ts [app-route] (ecmascript, async loader)");
                            triageResult = await analyzeImageForChat(imageBuffer);
                            console.log('[JIT] Triage Result:', JSON.stringify(triageResult, null, 2));
                            // 3. Architect (Prompt Engineering)
                            console.log('[JIT] Step 2: Architect designing... (Style: ' + (style || 'modern') + ')');
                            // Use the style from arguments, falling back to a default if needed
                            const targetStyle = style || 'modern renovation';
                            // 🔒 GET LOCKED PROMPT
                            const lockedPrompt = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$vision$2f$architect$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateArchitecturalPrompt"])(imageBuffer, targetStyle, keepElements || []);
                            console.log('[JIT] 🔒 Locked Prompt obtained from Architect');
                            // 4. Painter (Generation)
                            console.log('[JIT] Step 3: Painter executing...');
                            const { generateRenovation } = await __turbopack_context__.A("[project]/ai_core/src/imagen/generator.ts [app-route] (ecmascript, async loader)");
                            // ✅ PASS LOCKED PROMPT TO PAINTER (Pure String)
                            imageBuffer = await generateRenovation(imageBuffer, lockedPrompt);
                            // Set enhancedPrompt for the return value
                            enhancedPrompt = lockedPrompt; // Use the actual Architect prompt
                            console.log('[JIT] ✅ Pipeline generation complete');
                        } catch (jitError) {
                            console.error('[JIT] ⚠️ Pipeline failed, falling back to legacy T2I:', jitError);
                            // FALLBACK: Use standard T2I generation
                            console.log('[Fallback] Switching to standard Text-to-Image generation...');
                            enhancedPrompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildInteriorDesignPrompt"])({
                                userPrompt: safePrompt,
                                roomType: safeRoomType,
                                style: safeStyle
                            });
                            imageBuffer = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateInteriorImage"])({
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
                        enhancedPrompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildInteriorDesignPrompt"])({
                            userPrompt: safePrompt,
                            roomType: safeRoomType,
                            style: safeStyle
                        });
                        // Generate image (existing flow)
                        imageBuffer = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateInteriorImage"])({
                            prompt: enhancedPrompt,
                            aspectRatio: '16:9'
                        });
                    }
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    // 📤 UPLOAD TO FIREBASE STORAGE (New Utility)
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
                    // Use new Storage Utility
                    const { uploadGeneratedImage } = await __turbopack_context__.A("[project]/ai_core/src/storage/upload.ts [app-route] (ecmascript, async loader)");
                    const safeSlug = safeRoomType.replace(/\s+/g, '-');
                    // Upload and get Signed URL
                    const imageUrl = await uploadGeneratedImage(imageBuffer, sessionId, safeSlug);
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    // 💾 PERSISTENCE (Save Quote if JIT data exists)
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    if (triageResult) {
                        console.log('[JIT] Step 3: Saving quote draft with RENDER URL...');
                        const { saveQuoteDraft } = await __turbopack_context__.A("[project]/ai_core/src/db/quotes.ts [app-route] (ecmascript, async loader)");
                        // Now we pass the FINAL GENERATED IMAGE URL
                        await saveQuoteDraft(sessionId, imageUrl, triageResult);
                    }
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
                    const { getFirestore, Timestamp, FieldValue } = await __turbopack_context__.A("[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import, async loader)");
                    const { db } = await __turbopack_context__.A("[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript, async loader)");
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
        }),
        get_market_prices: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$ai$2d$sdk$2f$provider$2d$utils$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["tool"])({
            description: `Use this tool to find REAL-TIME market prices in Italy for specific renovation materials, furniture, or labor costs. 
            It searches the live web to find current offers from major Italian suppliers (Leroy Merlin, Iperceramica, etc.).
            Trigger this when the user asks "Quanto costa X?" or "Cerca il prezzo di Y".`,
            parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
                query: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe('The specific search query. Be specific. Example: "Prezzo gres porcellanato effetto legno Marazzi al mq", "Costo posa parquet Milano 2026", "Divano letto grigio 3 posti prezzi"'),
                category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
                    'materials',
                    'furniture',
                    'labor'
                ]).optional().describe('Context of the search to refine sources')
            }),
            execute: async ({ query })=>{
                console.log('🔍 [DEBUG] Tool called with query:', query);
                // 1. QUERY OPTIMIZATION - Add Italian domains to guide search
                const optimizedQuery = `${query} prezzo (site:.it OR site:leroymerlin.it OR site:iperceramica.it OR site:manomano.it)`;
                console.log(`🔎 [Perplexity] Optimized Query: "${optimizedQuery}"`);
                const apiKey = process.env.PERPLEXITY_API_KEY;
                if (!apiKey) {
                    console.error('❌ Missing PERPLEXITY_API_KEY');
                    return 'Errore configurazione: API Key mancante.';
                }
                try {
                    const response = await fetch('https://api.perplexity.ai/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'sonar',
                            messages: [
                                {
                                    role: 'system',
                                    content: 'Sei un AGGREGATORE DI PREZZI SINTETICO. REGOLE: 1. Un punto per Venditore. 2. Range (Min-Max). 3. NO nomi modelli. 4. Formato: [Venditore]: EUR[Min]-[Max]/mq'
                                },
                                {
                                    role: 'user',
                                    content: optimizedQuery
                                }
                            ],
                            temperature: 0.1
                        })
                    });
                    console.log('\ud83d\udd0d [DEBUG] Response status:', response.status, response.statusText);
                    if (!response.ok) {
                        const errorBody = await response.text();
                        console.error('🔍 [DEBUG] Error:', errorBody);
                        throw new Error(`Perplexity API Error: ${response.status}`);
                    }
                    const json = await response.json();
                    const content = json.choices?.[0]?.message?.content || 'Nessun risultato.';
                    const citations = json.citations || [];
                    console.log(`✅ [Perplexity] Found ${citations.length} citations.`);
                    const result = `Ho trovato informazioni sui prezzi:\n\n${content}\n\n📊 Fonti: ${citations.length} siti italiani`;
                    console.log('🔍 [DEBUG] Returning to Gemini (length:', result.length, 'chars)');
                    console.log('🔍 [DEBUG] First 200 chars:', result.substring(0, 200));
                    return result;
                } catch (error) {
                    console.error('❌ [Perplexity] Failed:', error);
                    return `Errore nella ricerca prezzi: ${error.message}`;
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
"[externals]/firebase-admin/app [external] (firebase-admin/app, esm_import)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("firebase-admin/app");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("firebase-admin/firestore");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[externals]/firebase-admin/storage [external] (firebase-admin/storage, esm_import)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("firebase-admin/storage");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "db",
    ()=>db,
    "getFirebaseStorage",
    ()=>getFirebaseStorage,
    "getFirestoreDb",
    ()=>getFirestoreDb,
    "storage",
    ()=>storage
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/app [external] (firebase-admin/app, esm_import)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/storage [external] (firebase-admin/storage, esm_import)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
/**
 * Firebase Admin SDK initialization for server-side operations
 * Singleton pattern ensures single instance across serverless invocations
 * ALWAYS loads from firebase-service-account.json for reliability
 */ let firebaseApp;
let firestoreInstance;
let storageInstance;
/**
 * ✅ CRITICAL FIX #2: Validate Firebase credentials format
 * Prevents security risks from malformed credentials
 */ /**
 * ✅ CRITICAL FIX #2: Sanitize and Validate Firebase Private Key
 * Prevents security risks from malformed credentials and ensures correct format.
 * Returns the sanitized private key.
 */ function sanitizeAndValidatePrivateKey(privateKey) {
    if (!privateKey) {
        throw new Error('[Firebase] Private key is missing');
    }
    // 1. Sanitize: Handle both escaped (\n) and unescaped newlines
    let sanitizedKey = privateKey.replace(/\\n/g, '\n');
    // 2. Sanitize: Remove wrapping quotes if present (common env var issue)
    if (sanitizedKey.startsWith('"') && sanitizedKey.endsWith('"')) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }
    if (sanitizedKey.startsWith("'") && sanitizedKey.endsWith("'")) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }
    // 3. Validation: Check for standard PEM format markers
    console.log('[Firebase] Debug Key:', {
        length: sanitizedKey.length,
        hasNewlines: sanitizedKey.includes('\n'),
        startsWith: sanitizedKey.substring(0, 30),
        endsWith: sanitizedKey.substring(sanitizedKey.length - 30),
        dotCount: (sanitizedKey.match(/\./g) || []).length // Check for weird conversions
    });
    if (!sanitizedKey.includes('BEGIN PRIVATE KEY') || !sanitizedKey.includes('END PRIVATE KEY')) {
        throw new Error('[Firebase] Invalid private key format - must be a valid RSA private key (PEM format)');
    }
    // 4. Validation: content check
    const keyContent = sanitizedKey.split('BEGIN PRIVATE KEY')[1]?.split('END PRIVATE KEY')[0];
    if (!keyContent || keyContent.trim().length < 100) {
        throw new Error('[Firebase] Private key appears to be truncated or empty');
    }
    // 5. Re-verify newlines for PEM validity
    if (!sanitizedKey.includes('\n')) {
        throw new Error('[Firebase] Private key invalid: missing newlines after sanitization');
    }
    return sanitizedKey;
}
/**
 * Validates other credential fields
 */ function validateServiceAccount(clientEmail, projectId) {
    // Validate email format
    if (!clientEmail || !clientEmail.includes('@') || !clientEmail.endsWith('.gserviceaccount.com')) {
        throw new Error(`[Firebase] Invalid service account email: ${clientEmail} - must end with .gserviceaccount.com`);
    }
    // Validate project ID format
    if (!projectId || projectId.length < 6 || !/^[a-z0-9-]+$/.test(projectId)) {
        throw new Error(`[Firebase] Invalid project ID: ${projectId} - must contain only lowercase letters, numbers, and hyphens`);
    }
}
/**
 * Initialize Firebase Admin SDK
 * Loads from environment variables (Vercel-compatible) or falls back to JSON file
 */ function initializeFirebase() {
    if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["getApps"])().length === 0) {
        console.log('[Firebase] Initializing Firebase Admin SDK...');
        try {
            // Try environment variables first (Vercel-compatible)
            // Try environment variables first (Vercel-compatible)
            const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
            if (rawPrivateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
                console.log('[Firebase] Loading credentials from environment variables');
                // ✅ CRITICAL FIX #2: Sanitize & Validate
                const privateKey = sanitizeAndValidatePrivateKey(rawPrivateKey);
                validateServiceAccount(process.env.FIREBASE_CLIENT_EMAIL, process.env.FIREBASE_PROJECT_ID);
                firebaseApp = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["initializeApp"])({
                    credential: (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["cert"])({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: privateKey
                    }),
                    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`
                });
                console.log('[Firebase] ✅ Successfully initialized from environment variables');
                return firebaseApp;
            }
            // Fallback to JSON file (local development)
            const fs = __turbopack_context__.r("[externals]/fs [external] (fs, cjs)");
            const path = __turbopack_context__.r("[externals]/path [external] (path, cjs)");
            const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
            console.log('[Firebase] Loading credentials from:', serviceAccountPath);
            if (!fs.existsSync(serviceAccountPath)) {
                throw new Error(`Firebase service account file not found at: ${serviceAccountPath}. Please ensure firebase-service-account.json exists in the project root OR set environment variables.`);
            }
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            // ✅ CRITICAL FIX #2: Validate JSON file credentials
            const privateKey = sanitizeAndValidatePrivateKey(serviceAccount.private_key);
            validateServiceAccount(serviceAccount.client_email, serviceAccount.project_id);
            firebaseApp = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["initializeApp"])({
                credential: (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["cert"])({
                    ...serviceAccount,
                    private_key: privateKey // Use sanitized key
                }),
                storageBucket: serviceAccount.project_id + '.firebasestorage.app'
            });
            console.log('[Firebase] ✅ Successfully initialized from JSON file');
            return firebaseApp; // Assert not null since we just initialized it
        } catch (error) {
            console.error('[Firebase] ❌ Initialization FAILED:', error);
            throw error;
        }
    }
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["getApps"])()[0];
}
function getFirestoreDb() {
    if (!firestoreInstance) {
        const app = initializeFirebase();
        firestoreInstance = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["getFirestore"])(app);
    // REMOVED: settings() call - was causing "already initialized" error
    }
    return firestoreInstance;
}
function getFirebaseStorage() {
    if (!storageInstance) {
        const app = initializeFirebase();
        storageInstance = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__["getStorage"])(app);
    }
    return storageInstance;
}
const db = getFirestoreDb;
const storage = getFirebaseStorage;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/ai_core/src/db/schema.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "COLLECTIONS",
    ()=>COLLECTIONS
]);
const COLLECTIONS = {
    USERS: 'users',
    SESSIONS: 'sessions',
    MESSAGES: 'messages',
    LEADS: 'leads'
};
}),
"[project]/ai_core/src/db/leads.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "getLeads",
    ()=>getLeads,
    "saveLead",
    ()=>saveLead
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/db/schema.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
async function saveLead(data) {
    try {
        const firestore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
        const leadData = {
            ...data,
            createdAt: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["FieldValue"].serverTimestamp(),
            status: 'new'
        };
        const leadRef = await firestore.collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].LEADS).add(leadData);
        console.log(`[saveLead] Lead saved with ID: ${leadRef.id}`);
        return {
            success: true,
            leadId: leadRef.id
        };
    } catch (error) {
        console.error('[saveLead] Error saving lead:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
async function getLeads(status, limit = 50) {
    try {
        const firestore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
        let query = firestore.collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].LEADS).orderBy('createdAt', 'desc').limit(limit);
        if (status) {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc)=>({
                ...doc.data(),
                id: doc.id
            }));
    } catch (error) {
        console.error('[getLeads] Error fetching leads:', error);
        return [];
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/ai_core/src/db/messages.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "ensureSession",
    ()=>ensureSession,
    "getConversationContext",
    ()=>getConversationContext,
    "saveMessage",
    ()=>saveMessage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/db/schema.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
async function getConversationContext(sessionId, limit = 10) {
    try {
        const firestore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
        // Query last N messages, ordered by timestamp descending
        const messagesRef = firestore.collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].SESSIONS).doc(sessionId).collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].MESSAGES).orderBy('timestamp', 'desc').limit(limit);
        const snapshot = await messagesRef.get();
        if (snapshot.empty) {
            console.log(`[getConversationContext] No messages found for session: ${sessionId}`);
            return [];
        }
        // Convert to array and reverse (oldest first for chat context)
        const messages = snapshot.docs.map((doc)=>{
            const data = doc.data();
            return {
                role: data.role,
                content: data.content,
                toolInvocations: data.toolCalls?.map((tc)=>({
                        toolCallId: crypto.randomUUID(),
                        toolName: tc.name,
                        args: tc.args,
                        state: 'result',
                        result: tc.result
                    }))
            };
        }).reverse(); // Reverse to get chronological order
        console.log(`[getConversationContext] Loaded ${messages.length} messages for session: ${sessionId}`);
        return messages;
    } catch (error) {
        console.error('[getConversationContext] Error loading context:', error);
        return [];
    }
}
async function saveMessage(sessionId, role, content, metadata) {
    try {
        const firestore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
        const messageData = {
            role,
            content,
            timestamp: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["FieldValue"].serverTimestamp(),
            ...metadata
        };
        // Add message to subcollection
        await firestore.collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].SESSIONS).doc(sessionId).collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].MESSAGES).add(messageData);
        // Update session metadata
        await firestore.collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].SESSIONS).doc(sessionId).set({
            updatedAt: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["FieldValue"].serverTimestamp(),
            messageCount: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["FieldValue"].increment(1),
            lastMessagePreview: content.substring(0, 100)
        }, {
            merge: true
        });
        console.log(`[saveMessage] Saved ${role} message to session: ${sessionId}`);
    } catch (error) {
        console.error('[saveMessage] Error saving message:', error);
    // Don't throw - message save failures shouldn't break the chat
    }
}
async function ensureSession(sessionId) {
    try {
        const firestore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
        const sessionRef = firestore.collection(__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["COLLECTIONS"].SESSIONS).doc(sessionId);
        const session = await sessionRef.get();
        if (!session.exists) {
            await sessionRef.set({
                createdAt: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["FieldValue"].serverTimestamp(),
                updatedAt: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["FieldValue"].serverTimestamp(),
                messageCount: 0,
                status: 'active'
            });
            console.log(`[ensureSession] Created new session: ${sessionId}`);
        }
    } catch (error) {
        console.error('[ensureSession] Error ensuring session:', error);
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/ai_core/src/imagen/upload-base64-image.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Upload base64 image to Firebase Storage and return public URL
 * 
 * Required for Imagen Capability API which needs HTTP/GCS URLs instead of base64
 * This is a helper function for the hybrid tool implementation
 */ /**
 * Upload base64 encoded image to Firebase Storage
 * 
 * @param options.base64Data - Base64 data URL (e.g., data:image/jpeg;base64,...)
 * @param options.sessionId - User session ID for organizing uploads
 * @param options.prefix - Optional prefix for storage path (default: 'user-uploads')
 * @returns Public HTTPS URL to the uploaded image
 * 
 * @example
 * ```typescript
 * const url = await uploadBase64Image({
 *   base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZ...',
 *   sessionId: 'abc123',
 *   prefix: 'user-uploads'
 * });
 * // Returns: https://storage.googleapis.com/bucket-name/user-uploads/abc123/1234567890-xyz.jpeg
 * ```
 */ __turbopack_context__.s([
    "extractMimeType",
    ()=>extractMimeType,
    "isValidBase64DataUrl",
    ()=>isValidBase64DataUrl,
    "uploadBase64Image",
    ()=>uploadBase64Image
]);
async function uploadBase64Image(options) {
    const { base64Data, sessionId, prefix = 'user-uploads' } = options;
    console.log('[Upload Base64] Starting upload...');
    try {
        // 🔒 SECURITY: Validate and sanitize sessionId (prevent path traversal)
        if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{20,50}$/.test(sessionId)) {
            throw new Error('Invalid sessionId format');
        }
        // 1. Parse base64 data URL to extract MIME type and data
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 format. Expected: data:image/TYPE;base64,DATA');
        }
        const mimeType = matches[1]; // e.g., 'image/jpeg', 'image/png'
        const base64String = matches[2];
        console.log(`[Upload Base64] Detected MIME type: ${mimeType}`);
        // 2. Convert base64 string to Buffer
        const imageBuffer = Buffer.from(base64String, 'base64');
        // 3. Validate image size (max 10MB to match existing validation)
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB
        if (imageBuffer.length > maxSizeBytes) {
            const sizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
            throw new Error(`Image too large: ${sizeMB}MB (maximum 10MB allowed)`);
        }
        const sizeKB = (imageBuffer.length / 1024).toFixed(2);
        console.log(`[Upload Base64] Image size: ${sizeKB} KB`);
        // 4. Generate unique filename to prevent collisions
        const timestamp = Date.now();
        const uniqueId = crypto.randomUUID().split('-')[0]; // First segment for brevity
        const extension = mimeType.split('/')[1]; // Extract extension (jpeg, png, webp, etc.)
        // 🔒 SECURITY: sessionId is already validated, safe to use in path
        const fileName = `${prefix}/${sessionId}/${timestamp}-${uniqueId}.${extension}`;
        console.log(`[Upload Base64] Target path: ${fileName}`);
        // 5. Import Firebase Storage dynamically (to avoid initialization issues)
        // 5. Import Firebase Storage dynamically
        console.log('[Upload Base64] Importing Firebase Admin...');
        const { storage } = await __turbopack_context__.A("[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript, async loader)");
        const bucket = storage().bucket();
        console.log(`[Upload Base64] Using bucket: ${bucket.name}`);
        // 6. Upload to Firebase Storage
        const file = bucket.file(fileName);
        console.log('[Upload Base64] Starting file.save()...');
        await file.save(imageBuffer, {
            contentType: mimeType,
            metadata: {
                cacheControl: 'public, max-age=31536000',
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    sessionId: sessionId,
                    source: 'chatbot-upload'
                }
            }
        });
        console.log('[Upload Base64] File saved to Storage. Making public...');
        // 7. Make file publicly accessible
        try {
            await file.makePublic();
            console.log('[Upload Base64] File made public successfully');
        } catch (pubError) {
            console.warn('[Upload Base64] Warning: makePublic failed (permissions?), continuing with signed URL fallback may be needed', pubError);
        // If makePublic fails, the public URL below (https://storage.googleapis.com...) won't work for unauthenticated users
        // But we don't block the flow, just log it.
        }
        // 8. Generate and return public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log(`[Upload Base64] ✅ Upload complete: ${publicUrl}`);
        return publicUrl;
    } catch (error) {
        console.error('[Upload Base64] ❌ Error:', error);
        // Provide user-friendly error messages
        if (error instanceof Error) {
            // Re-throw validation errors as-is
            if (error.message.includes('Invalid base64') || error.message.includes('too large')) {
                throw error;
            }
            // Handle Firebase errors
            if (error.message.includes('PERMISSION_DENIED')) {
                throw new Error('Storage permission denied. Please check Firebase Storage rules.');
            }
            if (error.message.includes('QUOTA_EXCEEDED')) {
                throw new Error('Storage quota exceeded. Please contact support.');
            }
        }
        // Generic error for unexpected issues
        throw new Error('Failed to upload image. Please try again.');
    }
}
function isValidBase64DataUrl(data) {
    const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp|bmp);base64,/;
    return base64Regex.test(data);
}
function extractMimeType(base64Data) {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,/);
    return matches ? matches[1] : null;
}
}),
"[project]/ai_core/src/index.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$vision$2f$analyze$2d$room$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/vision/analyze-room.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$generate$2d$interior$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/generate-interior.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$prompt$2d$builders$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/prompt-builders.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$chat$2d$tools$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/chat-tools.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$ai$2d$retry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/ai-retry.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$leads$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/db/leads.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/db/messages.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/db/schema.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$imagen$2f$upload$2d$base64$2d$image$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/imagen/upload-base64-image.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$leads$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$leads$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
;
;
;
;
;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/web_client/lib/firebase-admin.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "db",
    ()=>db,
    "getFirebaseStorage",
    ()=>getFirebaseStorage,
    "getFirestoreDb",
    ()=>getFirestoreDb,
    "storage",
    ()=>storage
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/app [external] (firebase-admin/app, esm_import)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/storage [external] (firebase-admin/storage, esm_import)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
/**
 * Firebase Admin SDK initialization for server-side operations
 * Singleton pattern ensures single instance across serverless invocations
 * ALWAYS loads from firebase-service-account.json for reliability
 */ let firebaseApp;
let firestoreInstance;
let storageInstance;
/**
 * ✅ CRITICAL FIX #2: Validate Firebase credentials format
 * Prevents security risks from malformed credentials
 */ /**
 * ✅ CRITICAL FIX #2: Sanitize and Validate Firebase Private Key
 * Prevents security risks from malformed credentials and ensures correct format.
 * Returns the sanitized private key.
 */ function sanitizeAndValidatePrivateKey(privateKey) {
    if (!privateKey) {
        throw new Error('[Firebase] Private key is missing');
    }
    // 1. Sanitize: Handle both escaped (\n) and unescaped newlines
    let sanitizedKey = privateKey.replace(/\\n/g, '\n');
    // 2. Sanitize: Remove wrapping quotes if present (common env var issue)
    if (sanitizedKey.startsWith('"') && sanitizedKey.endsWith('"')) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }
    if (sanitizedKey.startsWith("'") && sanitizedKey.endsWith("'")) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }
    // 3. Validation: Check for standard PEM format markers
    if (!sanitizedKey.includes('BEGIN PRIVATE KEY') || !sanitizedKey.includes('END PRIVATE KEY')) {
        throw new Error('[Firebase] Invalid private key format - must be a valid RSA private key (PEM format)');
    }
    // 4. Validation: content check
    const keyContent = sanitizedKey.split('BEGIN PRIVATE KEY')[1]?.split('END PRIVATE KEY')[0];
    if (!keyContent || keyContent.trim().length < 100) {
        throw new Error('[Firebase] Private key appears to be truncated or empty');
    }
    // 5. Re-verify newlines for PEM validity
    if (!sanitizedKey.includes('\n')) {
        throw new Error('[Firebase] Private key invalid: missing newlines after sanitization');
    }
    return sanitizedKey;
}
/**
 * Validates other credential fields
 */ function validateServiceAccount(clientEmail, projectId) {
    // Validate email format
    if (!clientEmail || !clientEmail.includes('@') || !clientEmail.endsWith('.gserviceaccount.com')) {
        throw new Error(`[Firebase] Invalid service account email: ${clientEmail} - must end with .gserviceaccount.com`);
    }
    // Validate project ID format
    if (!projectId || projectId.length < 6 || !/^[a-z0-9-]+$/.test(projectId)) {
        throw new Error(`[Firebase] Invalid project ID: ${projectId} - must contain only lowercase letters, numbers, and hyphens`);
    }
}
/**
 * Initialize Firebase Admin SDK
 * Loads from environment variables (Vercel-compatible) or falls back to JSON file
 */ function initializeFirebase() {
    if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["getApps"])().length === 0) {
        console.log('[Firebase] Initializing Firebase Admin SDK...');
        try {
            // Try environment variables first (Vercel-compatible)
            // Try environment variables first (Vercel-compatible)
            const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
            if (rawPrivateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
                console.log('[Firebase] Loading credentials from environment variables');
                // ✅ CRITICAL FIX #2: Sanitize & Validate
                const privateKey = sanitizeAndValidatePrivateKey(rawPrivateKey);
                validateServiceAccount(process.env.FIREBASE_CLIENT_EMAIL, process.env.FIREBASE_PROJECT_ID);
                firebaseApp = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["initializeApp"])({
                    credential: (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["cert"])({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: privateKey
                    }),
                    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`
                });
                console.log('[Firebase] ✅ Successfully initialized from environment variables');
                return firebaseApp;
            }
            // Fallback to JSON file (local development)
            const fs = __turbopack_context__.r("[externals]/fs [external] (fs, cjs)");
            const path = __turbopack_context__.r("[externals]/path [external] (path, cjs)");
            const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
            console.log('[Firebase] Loading credentials from:', serviceAccountPath);
            if (!fs.existsSync(serviceAccountPath)) {
                throw new Error(`Firebase service account file not found at: ${serviceAccountPath}. Please ensure firebase-service-account.json exists in the project root OR set environment variables.`);
            }
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            // ✅ CRITICAL FIX #2: Validate JSON file credentials
            const privateKey = sanitizeAndValidatePrivateKey(serviceAccount.private_key);
            validateServiceAccount(serviceAccount.client_email, serviceAccount.project_id);
            firebaseApp = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["initializeApp"])({
                credential: (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["cert"])({
                    ...serviceAccount,
                    private_key: privateKey // Use sanitized key
                }),
                storageBucket: serviceAccount.project_id + '.firebasestorage.app'
            });
            console.log('[Firebase] ✅ Successfully initialized from JSON file');
            return firebaseApp; // Assert not null since we just initialized it
        } catch (error) {
            console.error('[Firebase] ❌ Initialization FAILED:', error);
            throw error;
        }
    }
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$app__$5b$external$5d$__$28$firebase$2d$admin$2f$app$2c$__esm_import$29$__["getApps"])()[0];
}
function getFirestoreDb() {
    if (!firestoreInstance) {
        const app = initializeFirebase();
        firestoreInstance = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["getFirestore"])(app);
    // REMOVED: settings() call - was causing "already initialized" error
    }
    return firestoreInstance;
}
function getFirebaseStorage() {
    if (!storageInstance) {
        const app = initializeFirebase();
        storageInstance = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$storage__$5b$external$5d$__$28$firebase$2d$admin$2f$storage$2c$__esm_import$29$__["getStorage"])(app);
    }
    return storageInstance;
}
const db = getFirestoreDb;
const storage = getFirebaseStorage;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/web_client/lib/rate-limit.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

/**
 * Hybrid Rate Limiter - Firestore + In-Memory Cache
 * 
 * Architecture:
 * - Level 1: In-memory cache (fast, 10s TTL)
 * - Level 2: Firestore transaction (authoritative, distributed)
 * 
 * Benefits:
 * - Low latency for repeated requests (~0ms cache hit)
 * - Distributed protection against abuse
 * - Works across serverless instances
 */ __turbopack_context__.s([
    "checkRateLimit",
    ()=>checkRateLimit,
    "cleanupExpiredRateLimits",
    ()=>cleanupExpiredRateLimits,
    "getRateLimitStats",
    ()=>getRateLimitStats
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web_client/lib/firebase-admin.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/firebase-admin/firestore [external] (firebase-admin/firestore, esm_import)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
// Get Firestore instance
const db = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
// Configuration
const WINDOW_MS = 60000; // 1 minute sliding window
const MAX_REQUESTS = 20; // 20 requests per minute
const CACHE_TTL_MS = 10000; // 10 seconds cache
// In-memory cache for fast lookups
const cache = new Map();
// ✅ BUG FIX #1: Proper interval cleanup to prevent memory leak
let cleanupInterval = null;
function initializeCleanup() {
    if (cleanupInterval) return; // Already initialized
    cleanupInterval = setInterval(()=>{
        const now = Date.now();
        for (const [key, value] of cache.entries()){
            if (now - value.timestamp > CACHE_TTL_MS) {
                cache.delete(key);
            }
        }
    }, 30000); // Clean every 30 seconds
    console.log('[RateLimit] Cache cleanup interval initialized');
}
// Initialize cleanup on module load
initializeCleanup();
// Cleanup on process termination (important for serverless)
process.on('beforeExit', ()=>{
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('[RateLimit] Cache cleanup interval cleared');
    }
});
async function checkRateLimit(ip) {
    // Always check Firestore for accurate counting
    // NOTE: Cache was causing issues with window resets
    console.log('[RateLimit] Checking Firestore for IP:', ip);
    const result = await checkFirestoreRateLimit(ip);
    return result;
}
/**
 * Firestore-based rate limiting with sliding window
 */ async function checkFirestoreRateLimit(ip) {
    const rateLimitRef = db.collection('rate_limits').doc(ip);
    const result = await db.runTransaction(async (transaction)=>{
        const doc = await transaction.get(rateLimitRef);
        const now = Date.now();
        if (!doc.exists) {
            // First request from this IP
            transaction.set(rateLimitRef, {
                count: 1,
                windowStart: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["Timestamp"].fromMillis(now),
                lastRequest: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["Timestamp"].fromMillis(now)
            });
            return {
                allowed: true,
                remaining: MAX_REQUESTS - 1,
                resetAt: now + WINDOW_MS
            };
        }
        const data = doc.data(); // Firestore returns Timestamp objects
        const windowStart = data.windowStart.toMillis();
        const timeSinceWindowStart = now - windowStart;
        // Check if we need a new window
        if (timeSinceWindowStart >= WINDOW_MS) {
            // Start new window
            transaction.update(rateLimitRef, {
                count: 1,
                windowStart: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["Timestamp"].fromMillis(now),
                lastRequest: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["Timestamp"].fromMillis(now)
            });
            return {
                allowed: true,
                remaining: MAX_REQUESTS - 1,
                resetAt: now + WINDOW_MS
            };
        }
        // Within existing window
        if (data.count >= MAX_REQUESTS) {
            // Rate limit exceeded
            return {
                allowed: false,
                remaining: 0,
                resetAt: windowStart + WINDOW_MS
            };
        }
        // Increment counter
        transaction.update(rateLimitRef, {
            count: data.count + 1,
            lastRequest: __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["Timestamp"].fromMillis(now)
        });
        return {
            allowed: true,
            remaining: MAX_REQUESTS - (data.count + 1),
            resetAt: windowStart + WINDOW_MS
        };
    });
    return {
        ...result,
        resetAt: new Date(result.resetAt)
    };
}
async function cleanupExpiredRateLimits() {
    const twoHoursAgo = __TURBOPACK__imported__module__$5b$externals$5d2f$firebase$2d$admin$2f$firestore__$5b$external$5d$__$28$firebase$2d$admin$2f$firestore$2c$__esm_import$29$__["Timestamp"].fromMillis(Date.now() - 7200000);
    const snapshot = await db.collection('rate_limits').where('lastRequest', '<', twoHoursAgo).limit(500).get();
    if (snapshot.empty) {
        return 0;
    }
    const batch = db.batch();
    snapshot.docs.forEach((doc)=>batch.delete(doc.ref));
    await batch.commit();
    console.log(`[RateLimit Cleanup] Deleted ${snapshot.size} expired records`);
    return snapshot.size;
}
async function getRateLimitStats(ip) {
    const doc = await db.collection('rate_limits').doc(ip).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return {
        count: data.count,
        windowStart: data.windowStart.toMillis(),
        lastRequest: data.lastRequest.toMillis()
    };
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/web_client/app/api/chat/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic,
    "maxDuration",
    ()=>maxDuration,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$ai$2d$sdk$2f$google$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@ai-sdk/google/dist/index.mjs [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/ai/dist/index.mjs [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/ai_core/src/index.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/db/messages.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web_client/lib/rate-limit.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
// ✅ Helper: Extract text content from various message formats
function extractUserMessage(message) {
    // Case C: message.parts array (actual structure from AI SDK)
    if (message?.parts && Array.isArray(message.parts)) {
        return message.parts.filter((part)=>part.type === 'text').map((part)=>part.text).join('\n');
    }
    // Case B: message.content is an array (Vercel multipart)
    if (message?.content && Array.isArray(message.content)) {
        return message.content.filter((part)=>part.type === 'text').map((part)=>part.text).join('\n');
    }
    // Case A: message.content is a simple string
    if (typeof message?.content === 'string') {
        return message.content;
    }
    return '';
}
const maxDuration = 60;
const dynamic = 'force-dynamic';
const runtime = 'nodejs'; // Required for Firebase Admin SDK
const SYSTEM_INSTRUCTION = `[CORE IDENTITY]
You are SYD - ARCHITETTO PERSONALE, an advanced construction and design assistant.
Language: Italian.
Primary Rule: Classify intent immediately: MODE A (Designer) or MODE B (Surveyor).

[INTERACTION RULES]
1. **GREETINGS (Ciao)**: If the user says "Ciao" or greetings, DO NOT introduce yourself (you already did). Just answer: "Ciao! Come posso aiutarti con il tuo progetto?".
2. **QUESTION LIMIT**: Ask MAXIMUM 1 or 2 questions at a time. NEVER ask a long list of questions. Wait for the user's answer before proceeding.

[PHOTO UPLOAD DISAMBIGUATION]
**CRITICAL RULE**: If the user's intent is UNCLEAR (e.g., uploads photo with only "Ciao", generic greetings, or vague text):
1. DO NOT assume MODE A or MODE B
2. MUST ask explicitly which service they want:

Response Template:
"Ciao! Ho ricevuto la tua foto. Come posso aiutarti?

1. 🎨 **Visualizzare** come verrebbe ristrutturato con un rendering 3D
2. 📋 **Ricevere un preventivo** dettagliato per i lavori

Cosa preferisci?"

**WAIT for user's choice** before proceeding to MODE A or MODE B.


[EXISTING TOOL INSTRUCTIONS]
##  ANALISI IMMAGINI UPLOAD (FOTO UTENTE)

Quando l'utente carica una foto:
1. **ANALIZZA SUBITO** la foto.
2. **DESCRIVI** esplicitamente cosa vedi.
3. **NON GENERARE** ancora. Avvia il protocollo "Discovery" (vedi Mode A).

## ISTRUZIONI PER IL TOOL generate_render

**STEP 1 - structuralElements (OBBLIGATORIO):**
Prima di tutto, devi compilare il campo \`structuralElements\` con TUTTI gli elementi strutturali:
- Se l'utente ha caricato una FOTO: descrivi gli elementi visibili (es. "arched window on left wall, wooden ceiling beams, parquet floor")
- Se NON c'è foto: descrivi gli elementi richiesti nella conversazione
- Scrivi in INGLESE e sii SPECIFICO

**STEP 2 - roomType & style:**
Compila questi campi in INGLESE (es. "living room", "modern")

**STEP 3 - prompt (DEVE iniziare con structuralElements):**
Il prompt DEVE iniziare descrivendo gli elementi di STEP 1.

## 🔀 SCELTA MODALITÀ (mode)

### MODE: "creation" (Creazione da zero)
Usa quando l'utente NON ha caricato una foto

### MODE: "modification" (Modifica foto esistente)
Usa quando l'utente HA CARICATO una foto.
DEVI compilare \`sourceImageUrl\`:
1. Cerca nella cronologia il marker: \`[Immagine allegata: https://storage.googleapis.com/...]\`
2. Estrai l'URL dal marker

---

MODE A: THE DESIGNER (Rendering & Visual Flow)

Trigger: User wants to "visualize", "imagine", "see ideas", "style advice".

Scenario 1: Starting from Photo (Hybrid Vision) - STRICT PROTOCOL

Action:
1. ANALYZE (Silent): Identify structural constraints (windows, beams) from the image.
2. DISCOVERY (Mandatory): BEFORE generating, you MUST ask:
   - "Cosa vuoi MANTENERE? (es. pavimento, infissi)"
   - "Cosa vuoi CAMBIARE? (es. stile, colori)"
3. STOP & WAIT: Do NOT call 'generate_render' yet. You need these answers first.
4. GENERATE: Only AFTER the user replies to these questions, call 'generate_render'.
   - CRITICAL: You MUST populate the 'keepElements' parameter with the specific items the user wants to maintain (e.g., ["camino", "scuro", "pavimento"]).

Scenario 2: Starting from Zero

Action: Guide imagination (Room Type, Style, Key Elements).
Generate: Create a descriptive prompt from scratch.

---

MODE B: THE TECHNICAL SURVEYOR (Quote & Preventivo Flow)

Trigger: User wants "quote", "cost", "work details", "renovation".

Persona: You are a Technical Surveyor (Tecnico Rilevatore). Dry, precise, analytical.

Strict Rule: DO NOT ask for Budget or Timeline. Focus ONLY on Technical Specs.

THE CONVERGENCE PROTOCOL (Applies to BOTH Scenarios below):
You must ALWAYS gather these 3 Data Clusters before finishing. Do not skip any.

1. Logistics: (Floor, Elevator, Year of construction, Ceiling height).
2. Scope of Work: (Demolitions, Electrical/Plumbing status, Fixtures quantity).
3. Quantities: (Exact MQ/Metri Quadri and number of points).

Scenario 1: Starting from Photo

Action: Analyze -> Verify -> Converge.

- Analyze: Use the photo to identify the Current State. "Vedo pavimento in marmo e infissi in legno."
- Verify: Ask regarding the visual elements. "Intendi demolire questo pavimento o sovrapporre? Gli infissi che vedo vanno sostituiti?"
- Converge: IMMEDIATELY proceed to ask the missing "Protocol" questions that the photo cannot show (Logistics, Year, Exact MQ, Systems hidden in walls). Treat the photo as evidence, but complete the full questionnaire.

Scenario 2: Starting from Zero

Action: Execute the "Convergence Protocol" question by question.

Output (Mode B): End with a structured list: "Riepilogo Tecnico per Preventivo" containing all gathered Metrics and Works.

[STATE MACHINE & TRANSITIONS]
Track session state based on tools used and conversation history:

STATE 1: VISUAL_ONLY (Render generated, No Quote)
- Condition: generate_render was called successfully
- NEXT ACTION: You MUST propose Mode B (Technical Quote)
- Prompt: "Ti piace questo stile? Se vuoi, posso prepararti un preventivo gratuito per realizzarlo. Ti servono solo pochi dettagli tecnici."

STATE 2: TECHNICAL_ONLY (Quote/Data done, No Render)
- Condition: submit_lead_data was called successfully
- CHECK: Has render been generated for THIS project in conversation history?
- NEXT ACTION: Offer dual choice based on render existence

  SCENARIO A (Render MISSING):
  "Dati salvati correttamente! Ora abbiamo due strade:
  1. 🎨 **Visualizzare**: Vuoi vedere un Rendering 3D di come verrebbe?
  2. 💰 **Prezzi Reali**: Vuoi che cerchi i prezzi di mercato attuali per i materiali o gli arredi di cui abbiamo parlato?
  Dimmi tu come preferisci procedere."
  
  SCENARIO B (Render ALREADY DONE in history):
  "Dati salvati! Visto che abbiamo già il rendering, vuoi che cerchi i **prezzi reali di mercato** per gli elementi (pavimenti, arredi) che abbiamo visualizzato, per darti una stima dei costi d'acquisto?"

STATE 3: COMPLETE (Both Render AND Quote/Data exist)
- Condition: Both generate_render AND submit_lead_data were called successfully in this session
- NEXT ACTION: STOP proposing new flows. Focus on refining details or closing.
- Prompt: "Abbiamo tutto: progetto visivo e stima tecnica. Come vuoi procedere?"

**ANTI-LOOP RULE:**
Never propose a flow that has already been completed in the current session.
If user has already generated render, DO NOT propose it again.
If user has already submitted quote data, DO NOT propose it again.
`;
async function POST(req) {
    console.log("---> API /api/chat HIT");
    // ✅ Hybrid Rate Limiting (Firestore + In-Memory Cache)
    const ip = (req.headers.get('x-forwarded-for') ?? '127.0.0.1').split(',')[0];
    const { allowed, remaining, resetAt } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$web_client$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["checkRateLimit"])(ip);
    if (!allowed) {
        console.warn(`[RateLimit] IP ${ip} exceeded rate limit`);
        return new Response('Too Many Requests - Please wait before trying again', {
            status: 429,
            headers: {
                'Content-Type': 'text/plain',
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': resetAt.toISOString(),
                'Retry-After': Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString()
            }
        });
    }
    console.log(`[RateLimit] IP ${ip} allowed - ${remaining} requests remaining`);
    try {
        const body = await req.json();
        const { messages, images, imageUrls, sessionId } = body; // ✅ Extract imageUrls
        // ✅ BUG FIX #5: Strict sessionId validation (security)
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            console.error('[API] Missing or invalid sessionId');
            return new Response(JSON.stringify({
                error: 'sessionId is required',
                details: 'A valid session identifier must be provided'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
        console.log("API Request Debug:", {
            hasMessages: !!messages,
            messagesLength: messages?.length,
            hasImages: !!images,
            hasImageUrls: !!imageUrls,
            imageUrlsCount: imageUrls?.length || 0,
            sessionId
        });
        // Ensure session exists in Firestore
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ensureSession"])(sessionId);
        // Load conversation history from Firestore
        const conversationHistory = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getConversationContext"])(sessionId, 10);
        // Get the latest user message from the request
        const safeMessages = Array.isArray(messages) ? messages : [];
        const latestUserMessage = safeMessages[safeMessages.length - 1];
        // 👇 DEBUG CRITICO: Stampa la struttura grezza per capire dove è il testo
        console.log('🔍 [DEBUG RAW MESSAGE]:', JSON.stringify(latestUserMessage, null, 2));
        // Combine history + new message
        let coreMessages = [
            ...conversationHistory,
            {
                role: latestUserMessage?.role || 'user',
                content: latestUserMessage?.content || ''
            }
        ];
        // Inject images into the last user message if provided
        if (images && Array.isArray(images) && images.length > 0) {
            const lastMessage = coreMessages[coreMessages.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                const textContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
                lastMessage.content = [
                    {
                        type: 'text',
                        text: textContent
                    },
                    ...images.map((img)=>({
                            type: 'image',
                            image: img
                        }))
                ];
            }
        }
        // Save user message to Firestore (async, don't await)
        // ✅ FIX: Use helper to correctly extract text from message.parts structure
        let userTextContent = extractUserMessage(latestUserMessage);
        // ✅ HYBRID TOOL: Append marker with public URL if imageUrls available
        if (images && Array.isArray(images) && images.length > 0) {
            // If we have public URLs, include them in the marker for AI context
            if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
                // Save first URL (most recent image) in marker for modification mode
                const firstImageUrl = imageUrls[0];
                userTextContent += ` [Immagine allegata: ${firstImageUrl}]`;
                console.log('[API] ✅ Appended [Immagine allegata] marker with public URL:', firstImageUrl);
            } else {
                // Fallback: basic marker without URL
                userTextContent += ' [Immagine allegata]';
                console.log('[API] Appended [Immagine allegata] marker (no public URL available)');
            }
        }
        console.log('[Firestore] Attempting to save user message...', {
            sessionId,
            content: userTextContent.substring(0, 50)
        });
        console.log(`[API] Parsed User Message: "${userTextContent}"`);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["saveMessage"])(sessionId, 'user', userTextContent).then(()=>console.log('[Firestore] ✅ User message saved successfully')).catch((error)=>{
            console.error('[Firestore] ❌ ERROR saving user message:', error);
            console.error('[Firestore] Error details:', {
                message: error.message,
                stack: error.stack,
                code: error.code
            });
        });
        // Initialize Google Provider
        const googleProvider = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$ai$2d$sdk$2f$google$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createGoogleGenerativeAI"])({
            apiKey: process.env.GEMINI_API_KEY || ''
        });
        // ✅ CRITICAL FIX: Conditional Tool Loading
        // Only enable tools when user has explicitly requested them
        // This prevents Gemini from calling generate_render on simple greetings
        const conversationText = coreMessages.map((m)=>typeof m.content === 'string' ? m.content.toLowerCase() : '').join(' ');
        // Check if user has explicitly requested rendering/visualization
        // ✅ ALWAYS enable tools - let the AI decide when to use them
        // The system prompt already instructs the AI to only use tools after confirmation
        const { createChatTools } = await __turbopack_context__.A("[project]/ai_core/src/index.ts [app-route] (ecmascript, async loader)");
        const tools = createChatTools(sessionId);
        console.log('[Tools] ✅ Tools ENABLEED (always available)');
        // ✅ MANUAL DATA STREAM IMPLEMENTATION
        // Since createDataStream is missing in ai@6.0.5, we manually construct the stream
        // strictly following Vercel's Data Stream Protocol (v1)
        // ✅ MANUAL DATA STREAM IMPLEMENTATION
        // Since createDataStream is missing in certain versions, we manually construct the stream
        // strictly following Vercel's Data Stream Protocol (v1)
        const stream = new ReadableStream({
            async start (controller) {
                // Helper to write formatted data protocol chunks
                const writeData = (key, value)=>{
                    const raw = JSON.stringify(value);
                    controller.enqueue(new TextEncoder().encode(`${key}:${raw} \n`));
                };
                // ✅ ACCUMULATE STREAM: Track exactly what user sees for database persistence
                let streamedContent = '';
                try {
                    // 1. Start the actual AI stream
                    // Cast options to any to avoid strict type checks on experimental features
                    const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["streamText"])({
                        model: googleProvider(process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash'),
                        system: SYSTEM_INSTRUCTION,
                        messages: coreMessages,
                        tools: tools,
                        maxSteps: 5,
                        maxToolRoundtrips: 2,
                        experimental_providerMetadata: {
                            sessionId
                        },
                        // ✅ DIRECT TOOL RESULT STREAMING
                        // Write tool results directly to the stream instead of waiting for Gemini
                        async onToolCall ({ toolCall, toolResult }) {
                            console.log('🔧 [Tool Call]', toolCall.toolName);
                            // For market prices, write result directly to stream
                            if (toolCall.toolName === 'get_market_prices' && toolResult) {
                                const resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                                console.log('📤 [Direct Stream] Writing market prices directly to chat');
                                // Write as text delta to appear in chat
                                writeData('0', resultText);
                                streamedContent += resultText;
                            }
                        },
                        // Keep onFinish logic
                        onFinish: async ({ text, toolResults })=>{
                            console.log('[onFinish] 🔍 Streamed Content Length:', streamedContent.length);
                            console.log('[onFinish] Saving assistant message');
                            try {
                                // ✅ SINGLE SOURCE OF TRUTH: Save exactly what was streamed to user
                                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$db$2f$messages$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["saveMessage"])(sessionId, 'assistant', streamedContent, {
                                    toolCalls: toolResults?.map((tr)=>({
                                            name: tr.toolName || 'unknown',
                                            args: tr.args || {},
                                            result: tr.result || {}
                                        }))
                                });
                                console.log('[onFinish] ✅ Message saved successfully');
                            } catch (error) {
                                console.error('[onFinish] ❌ CRITICAL: Failed to save message', error);
                            }
                        }
                    });
                    // 2. Consume the FULL stream to capture tools and text
                    // We iterate over the full event stream to manually inject tool outputs (images) as text
                    for await (const part of result.fullStream){
                        if (part.type === 'text-delta') {
                            streamedContent += part.text;
                            writeData('0', part.text);
                        }
                        // Check for tool results (specifically our generation tool)
                        // ✅ SECURITY FIX: Robust error handling for tool failures
                        // ✅ MARKET PRICES: Write directly to stream
                        if (part.type === 'tool-result' && part.toolName === 'get_market_prices') {
                            try {
                                const result = part.result || part.output;
                                const resultText = typeof result === 'string' ? result : JSON.stringify(result);
                                console.log('📤 [Market Prices] Writing directly to stream');
                                console.log('📤 [Market Prices] Content length:', resultText.length);
                                // Write to chat
                                writeData('0', resultText);
                                streamedContent += resultText;
                            } catch (error) {
                                console.error('❌ [Market Prices] Failed to write to stream:', error);
                            }
                        }
                        if (part.type === 'tool-result' && part.toolName === 'generate_render') {
                            try {
                                const result = part.result || part.output;
                                // Check for error status first (tool-level failure)
                                if (result?.status === 'error') {
                                    const errorMessage = '\n\n⚠️ Mi dispiace, il servizio di rendering è temporaneamente non disponibile. Riprova tra qualche minuto.\n\n';
                                    console.error('[Stream] Tool returned error:', result.error);
                                    streamedContent += errorMessage;
                                    writeData('0', errorMessage);
                                } else if (result?.status === 'success' && result?.imageUrl) {
                                    // Inject the image as a markdown text chunk
                                    const imageMarkdown = `\n\n![](${result.imageUrl}) \n\n`;
                                    console.log('[Stream] Injecting image to stream:', result.imageUrl);
                                    streamedContent += imageMarkdown;
                                    writeData('0', imageMarkdown);
                                } else {
                                    // Unexpected result format
                                    const unexpectedError = '\n\n⚠️ Si è verificato un errore imprevisto. Riprova.\n\n';
                                    console.warn('[Stream] Unexpected tool result format:', result);
                                    streamedContent += unexpectedError;
                                    writeData('0', unexpectedError);
                                }
                            } catch (toolError) {
                                // Catch any unexpected errors during tool result processing
                                const processingError = '\n\n⚠️ Si è verificato un errore durante la generazione. Riprova.\n\n';
                                console.error('[Stream] Error processing tool result:', toolError);
                                streamedContent += processingError;
                                writeData('0', processingError);
                            }
                        }
                        // We also likely need to send tool call info if we want to be "correct", 
                        // but for this specific "Text + Image" requirement, injecting text is safer.
                        // ✅ FIX: Forward tool calls to client (Protocol '9')
                        if (part.type === 'tool-call') {
                            const p = part;
                            const toolCall = {
                                toolCallId: p.toolCallId,
                                toolName: p.toolName,
                                args: p.args || p.input || {}
                            };
                            writeData('9', toolCall);
                        }
                        // ✅ Forward ALL tool results (Protocol 'a') for frontend metadata access
                        // User-facing content sent via Protocol '0', metadata via Protocol 'a'
                        if (part.type === 'tool-result') {
                            const p = part;
                            const toolResult = {
                                toolCallId: p.toolCallId,
                                result: p.result
                            };
                            writeData('a', toolResult);
                        }
                    }
                    // 3. Close the stream cleanly
                    controller.close();
                } catch (error) {
                    // Protocol: '3' key for error messages
                    writeData('3', {
                        error: error.message
                    });
                    console.error("Stream Error:", error);
                    controller.close();
                }
            }
        });
        // Return the standard response with correct headers
        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Vercel-AI-Data-Stream': 'v1',
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': resetAt.toISOString()
            }
        });
    } catch (error) {
        console.error("Chat API Error Details:", error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__8963874c._.js.map