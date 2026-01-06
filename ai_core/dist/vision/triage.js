import { GoogleGenerativeAI } from '@google/generative-ai';
/**
 * Phase 1: The Triage Analyzer
 * Analyzes the room image to provide immediate context to the Chatbot.
 * Uses the fast 'gemini-3-flash-preview' model.
 *
 * @param imageBuffer - The image data as a Buffer
 * @returns Parsed TriageAnalysis JSON
 */
export async function analyzeImageForChat(imageBuffer) {
    console.log('[Triage] Starting analysis (Model: Flash)...');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use the Chat/Analysis model (Flash) as requested
    const modelVersion = process.env.CHAT_MODEL_VERSION || 'gemini-3-flash-preview';
    const model = genAI.getGenerativeModel({
        model: modelVersion,
        generationConfig: {
            responseMimeType: "application/json" // Force JSON mode if supported by the model version
        }
    });
    const prompt = `Analyze this room for renovation. 
    Return ONLY a JSON object with this structure: 
    { 
        "summary_for_chat": "A brief, natural language description of what you see (max 2 sentences) to be used by a chatbot.", 
        "technical_data": { 
            "room_type": "string", 
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
    }
    catch (error) {
        console.error('[Triage] Error:', error);
        throw new Error(`Triage analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
