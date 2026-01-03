// Tool definitions for chat API
import { tool } from 'ai';
import { z } from 'zod';
// ✅ BUG FIX #12: Removed duplicate import (storage is imported dynamically below)
import { saveLead } from './db/leads';
import { generateInteriorImage, buildInteriorDesignPrompt } from './imagen/generate-interior';
// ✅ VISION + T2I: Static imports (no I2I fallback needed)
import { analyzeRoomStructure } from './vision/analyze-room';
import { buildPromptFromRoomAnalysis } from './imagen/prompt-builders';
import { uploadBase64Image } from './imagen/upload-base64-image';
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
                const { prompt, roomType, style, structuralElements, mode, sourceImageUrl, modificationType } = args || {};

                try {
                    // Use sessionId from closure (injected via factory)
                    console.log('🏗️ [Chain of Thought] Structural elements detected:', structuralElements);
                    console.log('🛠️ [Hybrid Tool] Mode selected:', mode || 'creation (default)');
                    console.log('🔧 [Hybrid Tool] Modification Type:', modificationType || 'renovation (default)');
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
                            enhancedPrompt = buildPromptFromRoomAnalysis(
                                roomAnalysis,
                                safeStyle,
                                safePrompt
                            );

                            console.log('[Vision] Step 2: Generating with T2I using Vision-guided prompt');
                            console.log('[T2I] Prompt preview:', enhancedPrompt.substring(0, 150) + '...');

                            // Step 3: Generate with T2I (NOT I2I!)
                            imageBuffer = await generateInteriorImage({
                                prompt: enhancedPrompt,
                                aspectRatio: '16:9',
                                numberOfImages: 1,
                            });

                            console.log('[T2I] ✅ Generation complete using Vision-guided T2I');

                        } catch (visionError) {
                            console.error('[Vision] ⚠️ Analysis failed, falling back to standard T2I:', visionError);

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
                    const { storage } = await import('./firebase-admin');
                    const bucket = storage().bucket();

                    // ✅ BUG FIX #2: Add unique ID to prevent race conditions
                    const timestamp = Date.now();
                    const uniqueId = crypto.randomUUID().split('-')[0]; // First segment for brevity
                    const fileName = `renders/${sessionId}/${timestamp}-${uniqueId}-${safeRoomType.replace(/\s+/g, '-')}.png`;
                    const file = bucket.file(fileName);

                    await file.save(imageBuffer, {
                        contentType: 'image/png',
                        metadata: {
                            cacheControl: 'public, max-age=31536000',
                        },
                    });

                    // Generate Signed URL (valid for 7 days)
                    // This replaces makePublic() for better security
                    const [signedUrl] = await file.getSignedUrl({
                        action: 'read',
                        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
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
        } as any)
    };
}
