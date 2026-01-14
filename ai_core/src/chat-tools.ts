// Tool definitions for chat API
import { tool } from 'ai';
import { z } from 'zod';
// ✅ BUG FIX #12: Removed duplicate import (storage is imported dynamically below)
import { saveLead } from './db/leads';
import { generateInteriorImage, buildInteriorDesignPrompt } from './imagen/generate-interior';
import { generateInteriorImageI2I, buildI2IEditingPrompt } from './imagen/generate-interior-i2i';
// ✅ VISION + T2I: Static imports (no I2I fallback needed)
import { analyzeRoomStructure } from './vision/analyze-room';
import { buildPromptFromRoomAnalysis } from './imagen/prompt-builders';
import { uploadBase64Image } from './imagen/upload-base64-image';
import { generateArchitecturalPrompt } from './vision/architect';
import { checkToolQuota, incrementToolQuota } from './tool-quota';
import crypto from 'node:crypto';

// Factory function to create tools with injected sessionId and IP for quota checks
export function createChatTools(sessionId: string, ip: string) {

    // Define schemas first - ✅ CHAIN OF THOUGHT: Forza l'AI a riflettere sulla struttura prima del prompt
    const GenerateRenderParameters = z.object({
        // 1️⃣ STEP 1: Analizza la struttura (Chain of Thought)
        structuralElements: z.string()
            .min(5)
            .describe(
                'MANDATORY: List ALL structural elements visible in the user photo or mentioned in the request (in ENGLISH). ' +
                'Examples: "arched window", "beams". ' +
                'If no photo was uploaded, describe the structural requests.'
            ),

        // 2️⃣ STEP 2: Type & Style (già esistenti)
        roomType: z.string().min(3).describe('MANDATORY: Type of room in ENGLISH (e.g. "kitchen", "bathroom").'),
        style: z.string().min(3).describe('MANDATORY: Design style in ENGLISH (e.g. "industrial", "modern").'),

        // 3️⃣ STEP 3: Prompt finale (DEVE usare structuralElements)
        prompt: z.string()
            .min(10)
            .describe(
                'MANDATORY: The final detailed prompt for the image generator IN ENGLISH. ' +
                'MUST start by describing the structuralElements listed above.'
            ),

        // 🆕 HYBRID TOOL PARAMETERS (Optional - backward compatible)

        // 4️⃣ Mode selection (creation vs modification)
        mode: z.enum(['creation', 'modification'])
            .optional()
            .default('creation')
            .describe(
                'Choose "modification" if user uploaded a photo and wants to transform that specific room. ' +
                'Choose "creation" if user is describing an imaginary room from scratch. ' +
                'DEFAULT: "creation" if not specified.'
            ),

        // 5️⃣ Source image URL (required for modification mode)
        sourceImageUrl: z.string()
            .url()
            .optional()
            .describe(
                'REQUIRED if mode="modification". The public HTTPS URL of the uploaded user photo (from Firebase Storage). ' +
                'Search conversation history for URLs like "https://storage.googleapis.com/...". ' +
                'If user uploaded a photo but you cannot find the URL, ask them to re-upload. ' +
                'Leave empty for mode="creation".'
            ),
        // 6️⃣ Modification Type (for model selection)
        modificationType: z.enum(['renovation', 'detail'])
            .optional()
            .default('renovation')
            .describe(
                'Choose "renovation" for whole-room transformation (default). ' +
                'Choose "detail" for small edits (e.g., "change sofa color", "add plant"). ' +
                'This selects the appropriate AI model.'
            ),

        // 7️⃣ Elements to Keep (Crucial for JIT)
        keepElements: z.array(z.string())
            .optional()
            .default([])
            .describe(
                'List of specific structural or furniture elements the user explicitly asked to PRESERVE/KEEP. ' +
                'Examples: ["terracotta floor", "fireplace", "wooden beams", "staircase"]. ' +
                'This is CRITICAL for the "Modification" mode to ensure these objects remain untouched.'
            ),
    });

    const SubmitLeadParameters = z.object({
        name: z.string().max(100).describe('Customer name'),
        email: z.string().email().max(200).describe('Customer email'),
        phone: z.string().max(20).optional().describe('Customer phone number'),
        projectDetails: z.string().max(2000).describe('Detailed project description'),
        roomType: z.string().max(100).optional().describe('Type of room'),
        style: z.string().max(100).optional().describe('Preferred style'),
    });

    return {
        generate_render: tool({
            description: `Generate a photorealistic 3D rendering of an interior design.
            
            IMPORTANT CONFIRMATION RULE:
            DO NOT call without confirmation! First summarize collected details and ask: "Vuoi che proceda con la generazione?"
            
            CRITICAL - AFTER THIS TOOL RETURNS:
            You MUST include the returned imageUrl in your next response using markdown format.
            Example: "Ecco il rendering!\\n\\n![](RETURNED_IMAGE_URL)\\n\\nTi piace?"
            
            The imageUrl will be in the tool result under result.imageUrl - you MUST display it with ![](url) syntax.`,
            parameters: GenerateRenderParameters,
            execute: async (args: any) => {
                // Extract all parameters including new hybrid parameters
                const { prompt, roomType, style, structuralElements, mode, sourceImageUrl, modificationType, keepElements } = args || {};

                try {
                    // ✅ CHECK RENDER QUOTA (2 per IP per 24h)
                    console.log(`[generate_render] Checking quota for IP: ${ip}`);
                    const quotaCheck = await checkToolQuota(ip, 'render');

                    if (!quotaCheck.allowed) {
                        const resetTime = quotaCheck.resetAt.toLocaleString('it-IT');
                        console.warn(`[generate_render] Quota exceeded for IP ${ip}. Reset at: ${resetTime}`);
                        return {
                            status: 'error',
                            error: `Hai raggiunto il limite di ${quotaCheck.currentCount} rendering giornalieri. Potrai generare nuovi rendering dopo le ${resetTime}.`
                        };
                    }

                    console.log(`[generate_render] Quota OK. Remaining: ${quotaCheck.remaining} renders`);

                    // Use sessionId and ip from closure (injected via factory)
                    console.log('🏗️ [Chain of Thought] Structural elements detected:', structuralElements);
                    console.log('🛠️ [Hybrid Tool] Mode selected:', mode || 'creation (default)');
                    console.log('🔧 [Hybrid Tool] Modification Type:', modificationType || 'renovation (default)');
                    console.log('🛡️ [Hybrid Tool] KEEP ELEMENTS:', keepElements);
                    console.log('🎨 [generate_render] RECEIVED ARGS:', { prompt, roomType, style, mode, hasSourceImage: !!sourceImageUrl });

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
                    let imageBuffer: Buffer;
                    let enhancedPrompt: string;
                    let triageResult: any = null; // Lifted scope for persistence

                    // 🔥 AUTO-DETECT MODE FROM IMAGE PRESENCE
                    // If sourceImageUrl exists, we MUST be in modification mode (I2I), 
                    // unless explicitly told otherwise (rare).
                    // This fixes cases where the LLM forgets to pass mode="modification".
                    const actualMode = (sourceImageUrl && (!mode || mode === 'modification'))
                        ? 'modification'
                        : (mode || 'creation');

                    console.log(`🔍 [DEBUG] actualMode: "${actualMode}" derived from mode="${mode}" and hasImage=${!!sourceImageUrl}`);

                    // Use Triage logic
                    if (actualMode === 'modification' && sourceImageUrl) {
                        try {
                            console.log('[Hybrid Tool] 📸 Detected Renovation Mode (I2I)');

                            // Check if it's a storage URL
                            // Extract path from URL: https://storage.googleapis.com/.../app/user-uploads/...
                            // or https://firebasestorage.googleapis.com/.../o/user-uploads%2F...

                            // Simple fetch attempt first (for public URLs)
                            let buffer: Buffer;
                            const fetchResponse = await fetch(sourceImageUrl);

                            if (fetchResponse.ok) {
                                const arrayBuffer = await fetchResponse.arrayBuffer();
                                buffer = Buffer.from(arrayBuffer);
                            } else {
                                // Fallback: Try Admin SDK if forbidden (private bucket)
                                console.log('[JIT] Fetch failed (403/404), trying Admin SDK...');
                                const { getStorage } = await import('firebase-admin/storage');
                                const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);

                                // Extract relative path from URL (hacky but effective for standard Firebase URLs)
                                // Remove domain and bucket name to get object path
                                let objectPath = sourceImageUrl;
                                if (sourceImageUrl.includes('/o/')) {
                                    // Firebase Client URL
                                    objectPath = decodeURIComponent(sourceImageUrl.split('/o/')[1].split('?')[0]);
                                } else if (sourceImageUrl.includes('storage.googleapis.com')) {
                                    // Public HTTP URL
                                    const parts = sourceImageUrl.split(process.env.FIREBASE_STORAGE_BUCKET + '/');
                                    if (parts.length > 1) objectPath = parts[1].split('?')[0];
                                }

                                console.log('[JIT] Admin SDK downloading path:', objectPath);
                                const [fileBuffer] = await bucket.file(objectPath).download();
                                buffer = fileBuffer;
                            }

                            imageBuffer = buffer; // Assign to outer variable

                            // 2. Triage (Analysis)
                            console.log('[JIT] Step 1: Triage analysis...');
                            const { analyzeImageForChat } = await import('./vision/triage');
                            triageResult = await analyzeImageForChat(imageBuffer);
                            console.log('[JIT] Triage Result:', JSON.stringify(triageResult, null, 2));

                            // 3. Architect (Prompt Engineering)
                            console.log('[JIT] Step 2: Architect designing... (Style: ' + (style || 'modern') + ')');
                            // Use the style from arguments, falling back to a default if needed
                            const targetStyle = style || 'modern renovation';

                            // 🔒 GET STRUCTURED OUTPUT (Anchors + Vision)
                            // Ensure keepElements is always an array (coerce if string)
                            const safeKeepElements = Array.isArray(keepElements)
                                ? keepElements
                                : (keepElements ? [keepElements] : []);

                            const architectOutput = await generateArchitecturalPrompt(imageBuffer, targetStyle, safeKeepElements);
                            console.log('[JIT] ✅ Architect output received:', architectOutput.structuralSkeleton.length, 'chars skeleton');

                            // 4. Painter (Generation)
                            console.log('[JIT] Step 3: Painter executing with bifocal prompt...');
                            const { generateRenovation } = await import('./imagen/generator');

                            // ✅ PASS ARCHITECT OUTPUT TO PAINTER (Bifocal Strategy)
                            imageBuffer = await generateRenovation(imageBuffer, architectOutput, targetStyle);

                            // Set enhancedPrompt for the return value (combine for legacy compatibility)
                            enhancedPrompt = `${architectOutput.materialPlan} | Skeleton: ${architectOutput.structuralSkeleton.substring(0, 100)}`;

                            console.log('[JIT] ✅ Pipeline generation complete');

                        } catch (jitError) {
                            console.error('[JIT] ⚠️ Pipeline failed, falling back to legacy T2I:', jitError);

                            // FALLBACK: Use standard T2I generation
                            console.log('[Fallback] Switching to standard Text-to-Image generation...');

                            enhancedPrompt = buildInteriorDesignPrompt({
                                userPrompt: safePrompt,
                                roomType: safeRoomType,
                                style: safeStyle,
                            });

                            imageBuffer = await generateInteriorImage({
                                prompt: enhancedPrompt,
                                aspectRatio: '16:9',
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
                            style: safeStyle,
                        });

                        // Generate image (existing flow)
                        imageBuffer = await generateInteriorImage({
                            prompt: enhancedPrompt,
                            aspectRatio: '16:9',
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
                    const { uploadGeneratedImage } = await import('./storage/upload');
                    const safeSlug = safeRoomType.replace(/\s+/g, '-');

                    // Upload and get Signed URL
                    const imageUrl = await uploadGeneratedImage(imageBuffer, sessionId, safeSlug);

                    // ✅ INCREMENT QUOTA COUNTER (render successful)
                    try {
                        await incrementToolQuota(ip, 'render', { roomType: safeRoomType, style: safeStyle, imageUrl });
                        console.log(`[generate_render] ✅ Quota incremented for IP ${ip}`);
                    } catch (quotaError) {
                        // ⚠️ Non-blocking: Log but don't fail the entire operation
                        console.error(`[generate_render] ❌ Failed to increment quota:`, quotaError);
                    }

                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    // 💾 PERSISTENCE (Save Quote if JIT data exists)
                    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    if (triageResult) {
                        console.log('[JIT] Step 3: Saving quote draft with RENDER URL...');
                        const { saveQuoteDraft } = await import('./db/quotes');
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
                    console.error('[generate_render] ❌ Error:', error);
                    return {
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Image generation failed'
                    };
                }
            },
        } as any),

        submit_lead_data: tool({
            description: 'Submit collected lead data (contact information and project details) to Firestore',
            parameters: SubmitLeadParameters,
            execute: async (data: any) => {
                try {
                    // ✅ CHECK QUOTE QUOTA (2 per IP per 24h)
                    console.log(`[submit_lead_data] Checking quota for IP: ${ip}`);
                    const quotaCheck = await checkToolQuota(ip, 'quote');

                    if (!quotaCheck.allowed) {
                        const resetTime = quotaCheck.resetAt.toLocaleString('it-IT');
                        console.warn(`[submit_lead_data] Quota exceeded for IP ${ip}. Reset at: ${resetTime}`);
                        return {
                            success: false,
                            message: `Hai raggiunto il limite di ${quotaCheck.currentCount} preventivi giornalieri. Potrai richiedere nuovi preventivi dopo le ${resetTime}.`
                        };
                    }

                    console.log(`[submit_lead_data] Quota OK. Remaining: ${quotaCheck.remaining} quotes`);

                    console.log('[submit_lead_data] Saving lead to Firestore:', data);

                    const { getFirestore, Timestamp, FieldValue } = await import('firebase-admin/firestore');
                    const { db } = await import('./firebase-admin');
                    const firestore = db();

                    await firestore.collection('leads').add({
                        ...data,
                        createdAt: new Date().toISOString(),
                        source: 'chatbot',
                        status: 'new'
                    });

                    console.log('[submit_lead_data] ✅ Lead saved successfully');

                    //✅ INCREMENT QUOTA COUNTER (quote successful)
                    try {
                        await incrementToolQuota(ip, 'quote', { email: data.email, roomType: data.roomType });
                        console.log(`[submit_lead_data] ✅ Quota incremented for IP ${ip}`);
                    } catch (quotaError) {
                        // ⚠️ Non-blocking: Log but don't fail the entire operation
                        console.error(`[submit_lead_data] ❌ Failed to increment quota:`, quotaError);
                    }

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
        } as any),

        get_market_prices: tool({
            description: `Search REAL-TIME Italian market prices for renovation materials, furniture, or labor costs.
            Trigger when user asks: "Quanto costa X?" or "Cerca il prezzo di Y".
            Returns concise price ranges from Italian suppliers (max 5 lines).`,
            parameters: z.object({
                query: z.string().describe('Specific Italian search query. Examples: "prezzo gres porcellanato Italia 2026", "costo posa parquet al mq Milano"'),
            }),
            execute: async ({ query }: { query: string }) => {
                console.log('🔍 [get_market_prices] Query:', query);

                // Optimize query for Italian market
                const optimizedQuery = `${query} prezzo Italia 2026 (site:.it OR site:leroymerlin.it OR site:iperceramica.it OR site:manomano.it)`;
                console.log('🔎 [Perplexity] Optimized:', optimizedQuery);

                const apiKey = process.env.PERPLEXITY_API_KEY;
                if (!apiKey) {
                    console.error('❌ Missing PERPLEXITY_API_KEY');
                    return 'Errore: API Key mancante.';
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
                                    content: 'Sei un PRICE AGGREGATOR. REGOLE OBBLIGATORIE: 1) Cerca SOLO nei 5 siti più visitati per il materiale richiesto in Italia. 2) Output SOLO lista a puntini. 3) Formato ESATTO: "• [Nome Sito]: €[Min]-€[Max] /[unità]". 4) VIETATO scrivere introduzioni, titoli, note, o spiegazioni. 5) MAX 5 righe.'
                                },
                                {
                                    role: 'user',
                                    content: optimizedQuery
                                }
                            ],
                            temperature: 0.1
                        })
                    });

                    if (!response.ok) {
                        const errorBody = await response.text();
                        console.error('❌ [Perplexity] Error:', errorBody);
                        throw new Error(`Perplexity API Error: ${response.status}`);
                    }

                    const json = await response.json();
                    const content = json.choices?.[0]?.message?.content || 'Nessun risultato trovato.';

                    console.log('✅ [Perplexity] Response length:', content.length, 'chars');

                    return content;

                } catch (error: any) {
                    console.error('❌ [Perplexity] Failed:', error);
                    return `Errore nella ricerca prezzi: ${error.message}`;
                }
            }
        } as any)
    };
}
