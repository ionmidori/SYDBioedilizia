module.exports = [
"[project]/ai_core/src/vision/triage.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "analyzeImageForChat",
    ()=>analyzeImageForChat
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@google/generative-ai/dist/index.mjs [app-route] (ecmascript)");
;
async function analyzeImageForChat(imageBuffer) {
    // 1. Define model in a SINGLE variable
    const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash';
    // 2. Dynamic logging
    console.log('[Triage] Starting analysis...');
    console.log(`[Triage] Model: ${modelName}`);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found');
    }
    const genAI = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$google$2f$generative$2d$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["GoogleGenerativeAI"](apiKey);
    // 3. Use the variable
    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: "application/json" // Force JSON mode if supported by the model version
        }
    });
    const prompt = `Analyze this image for a home renovation context. 
    First, determine if this is an image of a room, building interior, or architectural space suitable for renovation.
    If it is a picture of a pet, food, person (without room context), car, or landscape without buildings, set "is_relevant" to false.

    Return ONLY a JSON object with this structure: 
    { 
        "is_relevant": boolean,
        "relevance_reason": "Brief explanation of why it is relevant or not",
        "summary_for_chat": "A brief, natural language description of what you see (max 2 sentences) to be used by a chatbot. If irrelevant, describe what it is.", 
        "technical_data": { 
            "room_type": "string (or 'unknown' if irrelevant)", 
            "condition": "good|average|poor|shell", 
            "complexity_score": number (1-10), 
            "detected_materials": ["string"] 
        } 
    }`;
    try {
        // Convert Buffer to Base64 for Gemini API
        const base64Image = imageBuffer.toString('base64');
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/jpeg' // Assuming JPEG for generic handling, or detect if strictly needed
                }
            }
        ]);
        const responseText = result.response.text();
        console.log('[Triage] Raw response:', responseText.substring(0, 100) + '...');
        // Strict JSON Parsing with cleanup
        const cleanJson = responseText.replace(/```json\n?|```/g, '').trim();
        const data = JSON.parse(cleanJson);
        // Runtime Validation
        if (!data.summary_for_chat || !data.technical_data) {
            throw new Error('Invalid JSON structure: missing required fields');
        }
        console.log('[Triage] ✅ Analysis complete:', data.technical_data.room_type);
        return data;
    } catch (error) {
        console.error('[Triage] Error:', error);
        throw new Error(`Triage analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
}),
];

//# sourceMappingURL=ai_core_src_vision_triage_ts_077e289f._.js.map