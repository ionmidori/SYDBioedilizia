
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { ArchitectOutput } from '../vision/architect';

/**
 * The Painter: Executes the renovation using bifocal prompting strategy.
 * Uses Gemini 3 Pro Image Preview (Multimodal) for high-fidelity generation.
 * 
 * ROLE: Senior AI Engineer Implementation
 * MODEL: gemini-3-pro-image-preview
 * REGION: us-central1
 */
export async function generateRenovation(imageBuffer: Buffer, architectOutput: ArchitectOutput): Promise<Buffer> {
    console.log(`[Painter] Starting renovation generation...`);
    // Ensure geometricConstraints defaults to standard values if missing (backward compatibility)
    const geometricParams = architectOutput.geometricConstraints || [
        "Maintain wall geometry and room proportions",
        "Preserve window and door placements",
        "Keep ceiling height"
    ];
    console.log(`[Painter] Anchors: ${architectOutput.structuralAnchors.length}, Vision length: ${architectOutput.styleVision.length} chars`);

    // --- 1. LANGUAGE MISMATCH CORRECTION (IT -> EN) ---
    const translationMap: { [key: string]: string } = {
        // Materials
        "cotto": "terracotta tiled floor",
        "parquet": "wooden parquet floor",
        "legno": "natural wooden surfaces",
        "marmo": "marble surfaces",
        "pietra": "stone masonry",
        "intonaco": "plaster walls",
        "mattoni": "exposed brickwork",
        // Elements
        "camino": "existing fireplace",
        "soffitto": "ceiling structure",
        "travi": "exposed wooden beams",
        "finestra": "window frames",
        "porta": "door frames",
        "scale": "staircase structure",
        "scala": "staircase structure",
        "ringhiera": "railing system",
        "parapetto": "railing system",
        // General
        "parete": "wall structure",
        "pareti": "wall structure",
        "pavimento": "floor surface"
    };

    const translateConstraint = (term: string): string => {
        const lowerTerm = term.toLowerCase().trim();
        let translatedParts: string[] = [];

        // Check each Italian key and collect all matches
        for (const [it, en] of Object.entries(translationMap)) {
            if (lowerTerm.includes(it)) {
                translatedParts.push(en);
            }
        }

        // If we found translations, join them; otherwise return original
        let result = translatedParts.length > 0 ? translatedParts.join(' and ') : term;

        // CRITICAL: Sanitize motion-related words to prevent motion blur
        const motionWords = ['spinning', 'rotating', 'moving', 'turning', 'revolving'];
        motionWords.forEach(word => {
            result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
        });

        return result.trim().replace(/\s+/g, ' '); // Clean up extra spaces
    };

    // --- 2. SEMANTIC NORMALIZATION (Standardize Constraint Categories) ---
    const normalizeConstraint = (constraint: string): string => {
        // Semantic categorization mapping: element -> explicit preservation aspect
        const semanticMap: { [key: string]: string } = {
            // Structural elements (preserve geometry/structure)
            'fireplace': 'fireplace structure',
            'staircase structure': 'staircase geometry',
            'ceiling structure': 'ceiling height',
            'wall structure': 'wall positions',
            'window frames': 'window placements',
            'door frames': 'door openings',
            'exposed wooden beams': 'beam structure',
            'railing system': 'railing configuration',

            // Surface/material elements (preserve material & finish)
            'floor surface': 'floor material finish',
            'terracotta tiled floor': 'terracotta tile flooring',
            'wooden parquet floor': 'parquet wood flooring',
            'natural wooden surfaces': 'natural wood finishes',
            'marble surfaces': 'marble material',
            'stone masonry': 'stone texture',
            'plaster walls': 'plaster finish',
            'exposed brickwork': 'brick texture'
        };

        let normalized = constraint.trim();

        // Apply semantic normalization
        for (const [pattern, replacement] of Object.entries(semanticMap)) {
            if (normalized.toLowerCase().includes(pattern.toLowerCase())) {
                // Replace with standardized semantic category
                normalized = normalized.replace(new RegExp(pattern, 'gi'), replacement);
            }
        }

        // Ensure proper capitalization (first letter uppercase)
        normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);

        // Remove redundant words like "existing" if present (we'll add it back consistently)
        normalized = normalized.replace(/^existing\s+/i, '');

        return normalized;
    };

    const translatedConstraints = architectOutput.structuralAnchors
        .map(translateConstraint)
        .map(normalizeConstraint); // Apply semantic normalization
    const hasPreservedElements = translatedConstraints.length > 0;

    // --- 3. PROMPT ASSEMBLY (CLEAN SLATE ENGINE) ---

    // Smart Material Extraction: Parse constraints into specific categories
    // Handle both proper arrays and comma-separated strings from user responses
    const materialSlots = {
        floor: null as string | null,
        stairs: null as string | null,
        fireplace: null as string | null
    };

    // If we received a single concatenated string, split it intelligently
    let individualConstraints: string[] = [];
    translatedConstraints.forEach(c => {
        // Split by common separators: comma, "and", semicolon
        const parts = c.split(/[,;]|\s+and\s+|\s+e\s+/i)
            .map(p => p.trim())
            .filter(p => p.length > 0);
        individualConstraints.push(...parts);
    });

    // Now categorize each individual constraint
    individualConstraints.forEach(c => {
        const lower = c.toLowerCase();

        // Floor materials (capture only floor-related terms)
        if ((lower.includes('floor') || lower.includes('parquet') || lower.includes('terracotta') || lower.includes('tile') || lower.includes('pavimento'))
            && !materialSlots.floor) {
            materialSlots.floor = c;
        }

        // Stair materials (capture only stair-related terms)
        if ((lower.includes('stair') || lower.includes('scala')) && !materialSlots.stairs) {
            materialSlots.stairs = c;
        }

        // Fireplace materials (capture only fireplace-related terms)
        if ((lower.includes('fireplace') || lower.includes('camino') || lower.includes('mantel')) && !materialSlots.fireplace) {
            materialSlots.fireplace = c;
        }
    });

    // --- SAFETY SANITIZATION: Remove condition qualifiers that conflict with "pristine, clean" ---
    const sanitizeMaterial = (material: string | null): string | null => {
        if (!material) return null;

        let sanitized = material;

        // Step 1: Remove common prefixes that don't add value
        const prefixesToRemove = ['user constraints:', 'existing', 'original', 'current'];
        prefixesToRemove.forEach(prefix => {
            const regex = new RegExp(`^${prefix}\\s*:?\\s*`, 'gi');
            sanitized = sanitized.replace(regex, '').trim();
        });

        // Step 2: Remove problematic adjectives (old, damaged, dirty, worn, etc.)
        const qualifiersToRemove = [
            'old', 'damaged', 'dirty', 'worn', 'stained', 'cracked', 'broken',
            'vecchio', 'sporco', 'rovinato', 'danneggiato', 'usurato'
        ];

        qualifiersToRemove.forEach(qualifier => {
            const regex = new RegExp(`\\b${qualifier}\\b`, 'gi');
            sanitized = sanitized.replace(regex, '').trim();
        });

        // Step 3: Extract core material name if it contains "structure" or "finish"
        // E.g., "fireplace structure" → "stone fireplace" (if "stone" is in the string)
        // Or just remove generic suffixes
        sanitized = sanitized
            .replace(/\s+(structure|finish|surface)\s*$/gi, '')
            .trim();

        // Step 4: Clean up extra whitespace
        sanitized = sanitized.replace(/\s+/g, ' ').trim();

        // Step 5: If we ended up with something too generic, try to extract material type
        const genericTerms = ['floor', 'staircase', 'fireplace', 'wall', 'ceiling'];
        if (genericTerms.some(term => sanitized.toLowerCase() === term)) {
            // Too generic - this shouldn't happen if Architect did its job
            // Return null to avoid generic prompts
            console.warn(`[Generator] Material too generic after sanitization: "${material}" → "${sanitized}"`);
            return null;
        }

        return sanitized;
    };

    // Apply sanitization to all slots
    materialSlots.floor = sanitizeMaterial(materialSlots.floor);
    materialSlots.stairs = sanitizeMaterial(materialSlots.stairs);
    materialSlots.fireplace = sanitizeMaterial(materialSlots.fireplace);


    // Build the Clean Slate Block dynamically
    let cleanSlateBlock = hasPreservedElements
        ? `[MATERIAL RE-GENERATION - THE CLEAN SLATE]
Do NOT just "keep" the pixels. You must RE-GENERATE these materials in 8K definition:`
        : "";

    let slotCounter = 1;
    if (materialSlots.floor) {
        cleanSlateBlock += `\n${slotCounter++}. FLOOR: Generate a pristine, clean ${materialSlots.floor} surface. It must cover the entire floor area, completely overriding any existing rugs or objects in the photo.`;
    }
    if (materialSlots.stairs) {
        cleanSlateBlock += `\n${slotCounter++}. STAIRS: Generate a clean ${materialSlots.stairs} finish on the existing stair geometry.`;
    }
    if (materialSlots.fireplace) {
        cleanSlateBlock += `\n${slotCounter++}. FIREPLACE: Apply a high-quality ${materialSlots.fireplace} finish to the existing shape.`;
    }

    // Fallback: if we have constraints but no slots matched (e.g., ceiling, beams)
    const unmatchedConstraints = individualConstraints.filter(c => {
        const lower = c.toLowerCase();
        return !lower.includes('floor') && !lower.includes('stair') && !lower.includes('fireplace')
            && !lower.includes('pavimento') && !lower.includes('scala') && !lower.includes('camino');
    });

    if (unmatchedConstraints.length > 0) {
        unmatchedConstraints.forEach((c, i) => {
            cleanSlateBlock += `\n${slotCounter++}. ${c.toUpperCase()}: Re-generate this element with high-definition PBR textures, removing all clutter.`;
        });
    }


    // --- CHECK IF WALLS SHOULD BE PRESERVED ---
    const wallsPreserved = translatedConstraints.some(c => {
        const lower = c.toLowerCase();
        return lower.includes('wall') || lower.includes('parete') || lower.includes('muro');
    });

    // Build Wall Override section ONLY if walls are NOT preserved
    let wallOverrideBlock = '';
    if (!wallsPreserved) {
        wallOverrideBlock = `
[WALL OVERRIDE - MANDATORY]
CRITICAL: The walls in the input photo MUST be completely repainted. Do NOT preserve the original wall color.

ACTION: Apply the wall color/finish specified in the style directive below.
- If style mentions specific wall color (e.g., "white walls", "grey walls"), use EXACTLY that color.
- If style mentions wall material (e.g., "exposed brick", "wood paneling"), apply that material.
- If no wall specification, default to neutral off-white/light grey smooth plaster.

EXECUTION: Treat the existing wall surface as a blank canvas. Cover it entirely with the new color/material.
`;
    }

    const bifocalPrompt = `
[SYSTEM ROLE]
You are an Expert Interior Designer AI.

[VISUAL REFERENCE INSTRUCTION]
Use the provided input image as a GEOMETRIC REFERENCE only.
- Respect the perspective lines and vanishing point.
- Respect the position of walls, windows, and ceiling.
- IGNORE the existing furniture, debris, and objects inside the room. Treat them as "noise" to be overwritten.

[GEOMETRIC ANCHORS - THE SHELL]
Preserve the PHYSICAL FORM (Mesh/Volume) of:
1. The Room boundaries (Walls, Ceiling, Floor plane).
2. The Fireplace structure (Shape only).
3. The Staircase structure (Shape only).
4. Window and Door structural openings.


${cleanSlateBlock}
${wallOverrideBlock}
[DESIGN MISSION]
${architectOutput.styleVision}

EXECUTION RULES:
- Furniture Layering: Place NEW high-end furniture (sofa, rug, coffee table, decor) ON TOP of the newly generated floor textures.
- Wall Treatment: Repaint walls according to the style directive above. Completely ignore the original wall color and imperfections - treat them as a blank canvas.
- Lighting: Bright, soft daylight. Ensure the new materials reflect this light realistically.
- Composition: Decluttered, studio-quality staging.

[LIGHTING PHYSICS - PHOTOREALISM]
CRITICAL: Apply Physically-Based Rendering (PBR) to ALL materials.

**Bounce Lighting (Global Illumination):**
- Floor materials MUST emit color bounce to adjacent surfaces (e.g., warm terracotta reflects orange hue onto walls, cool marble reflects blue-grey tones).
- Walls MUST receive and diffuse bounce light from floor and furniture.
- Ceiling MUST show subtle color cast from floor and walls.

**Material-Specific Light Behavior:**
- FLOOR (tiles, wood, stone): Apply realistic reflectivity. Terracotta = matte diffuse with slight sheen. Wood = anisotropic highlights along grain. Marble = sharp specular reflections.
- WALLS (painted surfaces): Soft diffuse reflection. Smooth plaster = subtle sheen in direct light. Matte paint = pure diffuse.
- FURNITURE (upholstery, wood, metal): Fabric = subsurface scattering with soft shadows. Wood = clear coat specularity. Metal = sharp reflections with environment mapping.

**Shadow Quality:**
- Ambient Occlusion: Strong contact shadows where surfaces meet (floor/wall junctions, furniture legs, corners).
- Soft Shadows: Volumetric penumbra from natural light sources (window light gradients).
- Caustics: If glass/water present, show light refraction patterns on nearby surfaces.

**Color Temperature:**
- Natural daylight = 5500-6500K (neutral to slightly cool).
- Bounced light from warm materials (wood, terracotta) = +500K shift (warmer).
- Shadows = -300K shift (slightly cooler for realism).

[TECHNICAL SPECS]
Photorealistic, Unreal Engine 5 render, 8k resolution, sharp focus, volumetric lighting, global illumination enabled.
`;

    // STEP 2: The Painter (Vertex AI Generation)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const location = 'us-central1'; // Reverted for Gemini 2.5 Flash (Global was for G3 Preview)

    if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID not found');
    }

    // Initialize Vertex AI
    // CHANGE: Removed explicit googleAuthOptions to force usage of Application Default Credentials (ADC)
    // This allows using local gcloud credentials which have full model access, instead of the limited Firebase SA.
    const vertex_ai = new VertexAI({
        project: projectId,
        location: location,
        // @ts-ignore
        apiVersion: 'v1beta1', // REQUIRED for Preview models
    });

    // Use the model version from env (User requested: gemini-2.5-flash-image for I2I)
    // Use the model version from env (User requested: gemini-2.5-flash-image)
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
            temperature: 0.65, // INCREASED: Allow creative freedom for furniture & style
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
            text: bifocalPrompt
        };

        const request = {
            contents: [{
                role: 'user',
                parts: [multimodalPrompt, textPart]
            }]
        };

        console.log('[Painter] Sending request to Vertex AI...');
        console.log('[Painter] FULL PROMPT:', bifocalPrompt);

        // Retry Logic for Resilience (Socket disconnects, timeouts)
        let response;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`[Painter] Attempt ${attempts}/${maxAttempts}...`);
                response = await generativeModel.generateContent(request);
                break; // Success!
            } catch (err: any) {
                console.warn(`[Painter] Attempt ${attempts} failed: ${err.message}`);

                // Specific retryable errors (Socket, specialized fetch errors)
                const isRetryable = err.message.includes('terminated') ||
                    err.message.includes('socket') ||
                    err.message.includes('fetch failed') ||
                    err.message.includes('ECONNRESET');

                if (attempts === maxAttempts || !isRetryable) {
                    throw err; // Give up
                }

                // Wait before retrying (Exponential backoff: 2s, 4s, 8s)
                const delay = 2000 * Math.pow(2, attempts - 1);
                console.log(`[Painter] Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        if (!response) throw new Error('Failed to get response after retries');

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
