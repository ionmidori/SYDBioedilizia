import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Triage Analysis Result
 * A lightweight summary for the Chatbot to understand the context.
 */
export interface TriageAnalysis {
    is_relevant: boolean; // True if it's a room/building interior/exterior suitable for renovation
    relevance_reason: string;
    summary_for_chat: string;
    technical_data: {
        room_type: string;
        condition: 'good' | 'average' | 'poor' | 'shell';
        complexity_score: number; // 1-10
        detected_materials: string[];
    };
}

/**
 * Phase 1: The Triage Analyzer
 * Analyzes the room image to provide immediate context to the Chatbot.
 * Uses the fast 'gemini-2.5-flash' model.
 * 
 * @param imageBuffer - The image data as a Buffer
 * @returns Parsed TriageAnalysis JSON
 */
export async function analyzeImageForChat(imageBuffer: Buffer): Promise<TriageAnalysis> {
    // 1. Define model in a SINGLE variable
    const modelName = process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash';

    // 2. Dynamic logging
    console.log('[Triage] Starting analysis...');
    console.log(`[Triage] Model: ${modelName}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
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
        const data = JSON.parse(cleanJson) as TriageAnalysis;

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
