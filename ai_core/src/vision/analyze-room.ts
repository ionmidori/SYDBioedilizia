import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Room structure analysis result from Gemini Vision
 */
export interface RoomAnalysis {
    room_type: string;
    approximate_size_sqm: number;
    architectural_features: string[];
    flooring_type: string;
    wall_color: string;
    ceiling_type: string;
    windows: { position: string; size: string }[];
    doors: { position: string }[];
    special_features: string[];
}

/**
 * Analyze room structure from uploaded photo using Gemini Vision
 * 
 * This function uses Gemini 1.5 Pro Vision to extract detailed structural
 * information from an interior photo, which will then be used to generate
 * a super-detailed prompt for T2I generation.
 * 
 * @param imageUrl - Public HTTPS URL of the uploaded photo
 * @returns Detailed structural analysis as JSON
 */
export async function analyzeRoomStructure(imageUrl: string): Promise<RoomAnalysis> {
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

    const genAI = new GoogleGenerativeAI(apiKey);
    // 3. Use the variable
    const model = genAI.getGenerativeModel({ model: modelName });

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
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Vision API request timed out')), TIMEOUT_MS)
        );

        console.log('[Vision] Sending request to Gemini Vision API...');

        // Race between API call and timeout
        const result = await Promise.race([
            model.generateContent([analysisPrompt, imagePart]),
            timeoutPromise
        ]) as any; // Cast to any because Promise.race returns the first resolved type

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

        let analysis: RoomAnalysis;

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
        if (
            typeof analysis.room_type !== 'string' ||
            typeof analysis.approximate_size_sqm !== 'number' ||
            !Array.isArray(analysis.architectural_features) ||
            typeof analysis.flooring_type !== 'string' ||
            typeof analysis.wall_color !== 'string' ||
            typeof analysis.ceiling_type !== 'string' ||
            !Array.isArray(analysis.windows) ||
            !Array.isArray(analysis.doors)
        ) {
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
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
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

        return { data: base64, mimeType };

    } catch (error) {
        console.error('[Vision] Error fetching image:', error);
        throw new Error(`Failed to fetch image from URL: ${url}`);
    }
}
