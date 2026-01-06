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
import crypto from 'node:crypto';

// Factory function to create tools with injected sessionId
export function createChatTools(sessionId: string) {

    // Define schemas first - ✅ CHAIN OF THOUGHT: Forza l'AI a riflettere sulla struttura prima del prompt
    const GenerateRenderParameters = z.object({
        // 1️⃣ STEP 1: Analizza la struttura (Chain of Thought)
        structuralElements: z.string()
            .min(20)
            .describe(
                'MANDATORY: List ALL structural elements visible in the user photo or mentioned in the request (in ENGLISH). ' +
                'Examples: "arched window on left wall", "exposed wooden ceiling beams", "parquet flooring", "high ceilings 3.5m". ' +
                'If no photo was uploaded, describe the structural requests from the conversation (e.g., "large kitchen island", "walk-in shower").'
            ),

        // 2️⃣ STEP 2: Type & Style (già esistenti)
        roomType: z.string().min(3).describe('MANDATORY: Type of room in ENGLISH (e.g. "kitchen", "bathroom").'),
        style: z.string().min(3).describe('MANDATORY: Design style in ENGLISH (e.g. "industrial", "modern").'),

        // 3️⃣ STEP 3: Prompt finale (DEVE usare structuralElements)
        prompt: z.string()
            .min(30)
            .describe(
                'MANDATORY: The final detailed prompt for the image generator IN ENGLISH. ' +
                'MUST start by describing the structuralElements listed above. ' +
                'Example: "A modern living room featuring a large arched window on the left wall, exposed wooden beams on the ceiling, and oak parquet flooring. The space includes..."'
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
                    // Use sessionId from closure (injected via factory)
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
                            const { analyzeImageForChat } = await import('./vision/triage');
                            triageResult = await analyzeImageForChat(imageBuffer);
                            console.log('[JIT] Triage Result:', JSON.stringify(triageResult, null, 2));

                            // 3. Architect (Prompt Engineering)
                            console.log('[JIT] Step 2: Architect designing... (Style: ' + (style || 'modern') + ')');
                            // Use the style from arguments, falling back to a default if needed
                            const targetStyle = style || 'modern renovation';

                            // 🔒 GET LOCKED PROMPT
                            const lockedPrompt = await generateArchitecturalPrompt(imageBuffer, targetStyle, keepElements || []);
                            console.log('[JIT] 🔒 Locked Prompt obtained from Architect');

                            // 4. Painter (Generation)
                            console.log('[JIT] Step 3: Painter executing...');
                            const { generateRenovation } = await import('./imagen/generator');

                            // ✅ PASS LOCKED PROMPT TO PAINTER (Pure String)
                            imageBuffer = await generateRenovation(imageBuffer, lockedPrompt);

                            // Set enhancedPrompt for the return value
                            enhancedPrompt = lockedPrompt; // Use the actual Architect prompt

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
                    console.error('[generate_render] Error:', error);
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
            description: `Use this tool to find REAL-TIME market prices in Italy for specific renovation materials, furniture, or labor costs. 
            It searches the live web to find current offers from major Italian suppliers (Leroy Merlin, Iperceramica, etc.).
            Trigger this when the user asks "Quanto costa X?" or "Cerca il prezzo di Y".`,
            parameters: z.object({
                query: z.string().describe('The specific search query. Be specific. Example: "Prezzo gres porcellanato effetto legno Marazzi al mq", "Costo posa parquet Milano 2026", "Divano letto grigio 3 posti prezzi"'),
                category: z.enum(['materials', 'furniture', 'labor']).optional().describe('Context of the search to refine sources'),
            }),
            execute: async ({ query, category }: { query: string; category?: 'materials' | 'furniture' | 'labor' }) => {
                console.log(`🔎 [Perplexity] Searching market for: "${query}" (Category: ${category})`);

                const apiKey = process.env.PERPLEXITY_API_KEY;
                if (!apiKey) {
                    console.error('❌ Missing PERPLEXITY_API_KEY');
                    return {
                        status: 'error',
                        message: 'Errore configurazione: API Key mancante. Contatta l\'amministratore.'
                    };
                }

                try {
                    // Definiamo un "Persona" specifica per Perplexity
                    // per evitare risposte generiche da chatbot
                    const systemPrompt = `
            Sei un esperto Computista Metrico specializzato nel mercato edile italiano.
            Il tuo obiettivo è trovare PREZZI REALI e ATTUALI (2025/2026) sul web.
            
            REGOLE DI RICERCA:
            1. Cerca SOLO su siti di fornitori italiani affidabili (es. Leroy Merlin, Iperceramica, Tecnomat, Bricoman, Marazzi, Amazon.it, IKEA Italia, preventivi.it).
            2. Ignora siti americani o generici.
            3. Per la manodopera, cerca tariffari regionali o portali di preventivi italiani recenti.
            
            FORMATO RISPOSTA (Obbligatorio):
            - Nome Prodotto / Servizio
            - Prezzo (o Range di prezzo)
            - Nome del Fornitore
            - Link diretto (se disponibile)
            
            Sii sintetico e tabellare. Se non trovi il prezzo esatto, dai una stima basata su prodotti simili.
            `;

                    const response = await fetch('https://api.perplexity.ai/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'llama-3.1-sonar-large-online', // Usa il modello "Online" più recente disponibile
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: query }
                            ],
                            temperature: 0.1, // Bassa temperatura per massima precisione fattuale
                            max_tokens: 1000  // Limitiamo la verbosità
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Perplexity API Error: ${response.statusText}`);
                    }

                    const json = await response.json();
                    const resultText = json.choices?.[0]?.message?.content || 'Nessun risultato trovato.';
                    const citations = json.citations || [];

                    console.log(`✅ [Perplexity] Search complete. Found ${citations.length} citations.`);

                    // Formattiamo il risultato per il Chatbot Principale (Gemini)
                    return {
                        status: 'success',
                        market_data: resultText,
                        sources: citations,
                        system_instruction: `
                [PRICE SEARCH COMPLETE]
                1. Present the prices found to the user clearly.
                2. Use the sources provided to validate the data.
                3. ASK: "Questi prezzi rientrano nel tuo budget? Vuoi che li inserisca nel preventivo finale?"
                `
                    };

                } catch (error: any) {
                    console.error('❌ [Perplexity] Request Failed:', error);
                    return {
                        status: 'error',
                        message: 'Non sono riuscito a collegarmi ai fornitori in questo momento.',
                        error_details: error.message
                    };
                }
            }
        } as any)
    };
}
