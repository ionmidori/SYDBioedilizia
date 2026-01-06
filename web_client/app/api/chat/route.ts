import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { google as googleProvider } from '@ai-sdk/google';
import { getConversationContext, saveMessage, ensureSession } from '@ai-core';
import { checkRateLimit } from '@/lib/rate-limit';
import type { createChatTools } from '@ai-core';
import { callAIWithRetry } from '@ai-core';

// ✅ Helper: Extract text content from various message formats
function extractUserMessage(message: any): string {
    // Case C: message.parts array (actual structure from AI SDK)
    if (message?.parts && Array.isArray(message.parts)) {
        return message.parts
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('\n');
    }

    // Case B: message.content is an array (Vercel multipart)
    if (message?.content && Array.isArray(message.content)) {
        return message.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('\n');
    }

    // Case A: message.content is a simple string
    if (typeof message?.content === 'string') {
        return message.content;
    }

    return '';
}

// Configurazione
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for Firebase Admin SDK

const SYSTEM_INSTRUCTION = `[CORE IDENTITY]
You are SYD - ARCHITETTO PERSONALE, an advanced construction and design assistant.
Language: Italian.
Primary Rule: Classify intent immediately: MODE A (Designer) or MODE B (Surveyor).

[INTERACTION RULES]
1. **GREETINGS (Ciao)**: If the user says "Ciao" or greetings, DO NOT introduce yourself (you already did). Just answer: "Ciao! Come posso aiutarti con il tuo progetto?".
2. **QUESTION LIMIT**: Ask MAXIMUM 1 or 2 questions at a time. NEVER ask a long list of questions. Wait for the user's answer before proceeding.

[EXISTING TOOL INSTRUCTIONS]
## 🖼️ VISUALIZZAZIONE IMMAGINI - REGOLA CRITICA

**Quando il tool generate_render restituisce un imageUrl, DEVI SEMPRE includere l'immagine usando Markdown:**

FORMATO CORRETTO (Esempio):
Ecco il tuo rendering!

![Rendering soggiorno moderno](URL_IMMAGINE_DA_TOOL)

Ho creato un ambiente luminoso con toni neutri come richiesto. Che ne pensi?

**IMPORTANTE**: 
- DEVI SEMPRE includere l'immagine subito dopo che il tool restituisce imageUrl
- Usa SEMPRE la sintassi Markdown: ![](URL_IMMAGINE)
- L'URL è nel campo imageUrl del risultato del tool

## 📸 ANALISI IMMAGINI UPLOAD (FOTO UTENTE)

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

[CROSS-MODE TRANSITIONS]
CRITICAL: You must intelligently guide the user between Mode A (Vision) and Mode B (Technical).

CHECK HISTORY:
- IS "DESIGN_DONE"? (True if: You just generated an image OR User is discussing a generated image).
- IS "QUOTE_DONE"? (True if: You just generated "Riepilogo Tecnico" OR User submitted technical data).

TRANSITION LOGIC:
1. IF (DESIGN_DONE == TRUE) AND (QUOTE_DONE == FALSE):
   - PROPOSE: "Ti piace questo stile? Se vuoi, posso prepararti un preventivo gratuito per realizzarlo. Ti servono solo pochi dettagli tecnici."
   
2. IF (QUOTE_DONE == TRUE) AND (DESIGN_DONE == FALSE):
   - PROPOSE: "Ora che abbiamo i dettagli tecnici, vuoi vedere come verrebbe? Posso generare un rendering fotorealistico per te."

3. IF (DESIGN_DONE == TRUE) AND (QUOTE_DONE == TRUE):
   - STOP PROPOSING FLOWS.
   - ASK: "Abbiamo sia il progetto visivo che i dati tecnici. C'è altro che vuoi modificare o approfondire prima di procedere?"
`;




/**
 * POST /api/chat - Main chat endpoint with AI streaming
 * Handles conversation with Gemini Pro and tool execution
 */


export async function POST(req: Request) {
    console.log("---> API /api/chat HIT");

    // ✅ Hybrid Rate Limiting (Firestore + In-Memory Cache)
    const ip = (req.headers.get('x-forwarded-for') ?? '127.0.0.1').split(',')[0];

    const { allowed, remaining, resetAt } = await checkRateLimit(ip);

    if (!allowed) {
        console.warn(`[RateLimit] IP ${ip} exceeded rate limit`);
        return new Response('Too Many Requests - Please wait before trying again', {
            status: 429,
            headers: {
                'Content-Type': 'text/plain',
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': resetAt.toISOString(),
                'Retry-After': Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString(),
            },
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
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log("API Request Debug:", {
            hasMessages: !!messages,
            messagesLength: messages?.length,
            hasImages: !!images,
            hasImageUrls: !!imageUrls, // ✅ Log imageUrls presence
            imageUrlsCount: imageUrls?.length || 0,
            sessionId
        });

        // Ensure session exists in Firestore
        await ensureSession(sessionId);

        // Load conversation history from Firestore
        const conversationHistory = await getConversationContext(sessionId, 10);

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
                    { type: 'text', text: textContent },
                    ...images.map((img: string) => ({ type: 'image', image: img }))
                ] as any;
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

        console.log('[Firestore] Attempting to save user message...', { sessionId, content: userTextContent.substring(0, 50) });
        console.log(`[API] Parsed User Message: "${userTextContent}"`);
        saveMessage(sessionId, 'user', userTextContent)
            .then(() => console.log('[Firestore] ✅ User message saved successfully'))
            .catch((error) => {
                console.error('[Firestore] ❌ ERROR saving user message:', error);
                console.error('[Firestore] Error details:', {
                    message: error.message,
                    stack: error.stack,
                    code: error.code
                });
            });

        // Initialize Google Provider
        const googleProvider = createGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY || '',
        });

        // ✅ CRITICAL FIX: Conditional Tool Loading
        // Only enable tools when user has explicitly requested them
        // This prevents Gemini from calling generate_render on simple greetings

        const conversationText = coreMessages.map((m: any) =>
            typeof m.content === 'string' ? m.content.toLowerCase() : ''
        ).join(' ');

        // Check if user has explicitly requested rendering/visualization
        // ✅ ALWAYS enable tools - let the AI decide when to use them
        // The system prompt already instructs the AI to only use tools after confirmation
        const { createChatTools } = await import('@ai-core');
        const tools = createChatTools(sessionId);
        console.log('[Tools] ✅ Tools ENABLEED (always available)');

        // ✅ MANUAL DATA STREAM IMPLEMENTATION
        // Since createDataStream is missing in ai@6.0.5, we manually construct the stream
        // strictly following Vercel's Data Stream Protocol (v1)

        // ✅ MANUAL DATA STREAM IMPLEMENTATION
        // Since createDataStream is missing in certain versions, we manually construct the stream
        // strictly following Vercel's Data Stream Protocol (v1)

        const stream = new ReadableStream({
            async start(controller) {
                // Helper to write formatted data protocol chunks
                const writeData = (key: string, value: any) => {
                    const raw = JSON.stringify(value);
                    controller.enqueue(new TextEncoder().encode(`${key}:${raw} \n`));
                };

                try {
                    // 1. Start the actual AI stream
                    // Cast options to any to avoid strict type checks on experimental features
                    const result = streamText({
                        model: googleProvider(process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash'),
                        system: SYSTEM_INSTRUCTION,
                        messages: coreMessages as any,
                        tools: tools as any,
                        maxSteps: 5,
                        experimental_providerMetadata: { sessionId },

                        // Keep onFinish logic
                        onFinish: async ({ text, toolResults }: { text: string; toolResults: any[] }) => {
                            console.log('[onFinish] 🔍 AI Generated Text:', JSON.stringify(text));
                            console.log('[onFinish] Text length:', text?.length || 0);

                            let finalText = text;
                            const renderTool = Array.isArray(toolResults)
                                ? (toolResults as any[]).find(tr =>
                                    tr && typeof tr === 'object' && tr.toolName === 'generate_render'
                                )
                                : undefined;

                            if (renderTool) {
                                console.log('[onFinish] Tool results:', JSON.stringify(toolResults, null, 2));
                                const result = renderTool.result || renderTool.output;
                                if (result?.status === 'success' && result?.imageUrl) {
                                    const imageUrl = result.imageUrl;
                                    console.log('[onFinish] Found imageUrl:', imageUrl);
                                    const imageMarkdown = `\n\n![](${imageUrl}) \n\n`;
                                    finalText = finalText ? `${finalText}${imageMarkdown} ` : `Ecco il tuo rendering!${imageMarkdown} `;
                                    console.log('[onFinish] ✅ Injected image Markdown for database');
                                }
                            }

                            console.log('[onFinish] Saving assistant message');
                            try {
                                await saveMessage(sessionId, 'assistant', finalText, {
                                    toolCalls: toolResults?.map((tr: any) => ({
                                        name: tr.toolName || 'unknown',
                                        args: tr.args || {},
                                        result: tr.result || {}
                                    }))
                                });
                                console.log('[onFinish] ✅ Message saved successfully');
                            } catch (error) {
                                console.error('[onFinish] ❌ CRITICAL: Failed to save message', error);
                            }
                        },
                    } as any);

                    // 2. Consume the FULL stream to capture tools and text
                    // We iterate over the full event stream to manually inject tool outputs (images) as text
                    for await (const part of result.fullStream) {
                        if (part.type === 'text-delta') {
                            writeData('0', part.text);
                        }

                        // Check for tool results (specifically our generation tool)
                        // ✅ SECURITY FIX: Robust error handling for tool failures
                        if (part.type === 'tool-result' && part.toolName === 'generate_render') {
                            try {
                                const result = (part as any).result || (part as any).output;

                                // Check for error status first (tool-level failure)
                                if (result?.status === 'error') {
                                    const errorMessage = '\n\n⚠️ Mi dispiace, il servizio di rendering è temporaneamente non disponibile. Riprova tra qualche minuto.\n\n';
                                    console.error('[Stream] Tool returned error:', result.error);
                                    writeData('0', errorMessage);
                                } else if (result?.status === 'success' && result?.imageUrl) {
                                    // Inject the image as a markdown text chunk
                                    // This trick forces the frontend to render the image as part of the message
                                    const imageMarkdown = `\n\n![](${result.imageUrl}) \n\n`;
                                    console.log('[Stream] Injecting image only to stream:', result.imageUrl);
                                    writeData('0', imageMarkdown);
                                } else {
                                    // Unexpected result format
                                    console.warn('[Stream] Unexpected tool result format:', result);
                                    writeData('0', '\n\n⚠️ Si è verificato un errore imprevisto. Riprova.\n\n');
                                }
                            } catch (toolError) {
                                // Catch any unexpected errors during tool result processing
                                console.error('[Stream] Error processing tool result:', toolError);
                                writeData('0', '\n\n⚠️ Si è verificato un errore durante la generazione. Riprova.\n\n');
                            }
                        }

                        // We also likely need to send tool call info if we want to be "correct", 
                        // but for this specific "Text + Image" requirement, injecting text is safer.

                        // ✅ FIX: Forward tool calls to client (Protocol '9')
                        if (part.type === 'tool-call') {
                            const p = part as any;
                            const toolCall = {
                                toolCallId: p.toolCallId,
                                toolName: p.toolName,
                                args: p.args || p.input || {}
                            };
                            writeData('9', toolCall);
                        }

                        // ✅ FIX: Forward other tool results (Protocol 'a')
                        // We skip generate_render because we handle it specially above (injecting text '0')
                        if (part.type === 'tool-result' && part.toolName !== 'generate_render') {
                            const p = part as any;
                            const toolResult = {
                                toolCallId: p.toolCallId,
                                result: p.result
                            };
                            writeData('a', toolResult);
                        }
                    }

                    // 3. Close the stream cleanly
                    controller.close();

                } catch (error: any) {
                    // Protocol: '3' key for error messages
                    writeData('3', { error: error.message });
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
                'X-Vercel-AI-Data-Stream': 'v1', // Activates frontend tool/image mode
                'X-RateLimit-Limit': '20',
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': resetAt.toISOString(),
            },
        });

    } catch (error: any) {
        console.error("Chat API Error Details:", error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
