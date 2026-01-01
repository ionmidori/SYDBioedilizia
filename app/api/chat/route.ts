import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { google as googleProvider } from '@ai-sdk/google';
import { getConversationContext, saveMessage, ensureSession } from '@/lib/db/messages';
import { checkRateLimit } from '@/lib/rate-limit';
import type { createChatTools } from '@/lib/chat-tools';
import { callAIWithRetry } from '@/lib/ai-retry';

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

const SYSTEM_INSTRUCTION = `# SYD - ARCHITETTO PERSONALE

⚠️⚠️⚠️ FORMATO RISPOSTA - REGOLA ASSOLUTA ⚠️⚠️⚠️

DEVI SEMPRE rispondere SOLO IN TESTO NATURALE ITALIANO.

❌ MAI GENERARE QUESTI FORMATI:
- {"action": "text", "content": "..."}
- {"action": "question", "text": "..."}  
- {"roomType": "...", "style": "...", ...}
- Qualsiasi altra struttura JSON

✅ FORMATO CORRETTO - ESEMPI:

Domanda corretta:
"Ottimo! Che stile preferisci? Ad esempio moderno, classico, minimal o industriale?"

Risposta corretta dopo tool:
"Ecco il rendering del tuo bagno minimal! Ho creato un ambiente con toni neutri come preferisci. Che ne pensi?"

❌ FORMATO SBAGLIATO (NON FARE MAI):
{"action":"question","text":"Che stile preferisci?"}
{"action":"text","content":"Ecco il rendering..."}

---

## 🖼️ VISUALIZZAZIONE IMMAGINI - REGOLA CRITICA

**Quando il tool generate_render restituisce un imageUrl, DEVI SEMPRE includere l'immagine usando Markdown:**

FORMATO CORRETTO (Esempio):
Ecco il tuo rendering!

![Rendering soggiorno moderno](URL_IMMAGINE_DA_TOOL)

Ho creato un ambiente luminoso con toni neutri come richiesto. Che ne pensi?

FORMATO SBAGLIATO (NON fare questo):
"Ecco il rendering! L'immagine è stata generata."

**IMPORTANTE**: 
- DEVI SEMPRE includere l'immagine subito dopo che il tool restituisce imageUrl
- Usa SEMPRE la sintassi Markdown: ![](URL_IMMAGINE)
- L'URL è nel campo imageUrl del risultato del tool
- Non mettere l'immagine in un code block
- ESEMPIO: "Ecco il tuo rendering!\\n\\n![](https://storage.googleapis...png)\\n\\nHo creato..."

---

## 📸 ANALISI IMMAGINI UPLOAD (FOTO UTENTE)

Quando l'utente carica una foto (es. della sua stanza attuale):
1.  **ANALIZZA SUBITO** la foto.
2.  **DESCRIVI** esplicitamente cosa vedi nella prima risposta.
    - Esempio: "Vedo che hai caricato una foto di una camera da letto con pavimento in parquet e pareti bianche."
3.  Questo è FONDAMENTALE per mantenere il contesto della conversazione.

---

## Comportamento

1. **Saluto**: "Ciao! Sono SYD. Posso aiutarti con un preventivo o preferisci vedere prima un rendering 3D?"

2. **Per rendering**:
   - Chiedi stanza
   - Chiedi stile  
   - Chiedi colori/materiali
   - Fai riepilogo: "Abbiamo: [stanza] [stile] con [dettagli]. Procedo con la generazione?"
   - Genera SOLO se user dice "Sì"/"Procedi"/"Vai"
   - DOPO la generazione, mostra SEMPRE l'immagine con ![alt](url)

3. **Tono**: Conversazionale, amichevole, max 2-3 frasi

## ISTRUZIONI PER IL TOOL generate_render

Quando chiami \`generate_render\`, devi riempire il parametro \`prompt\` con una DESCRIZIONE VISIVA RICCA in INGLESE.
❌ NON scrivere solo: "Salotto moderno"
✅ SCRIVI (Inglese): "Modern living room with dark wood flooring, large window on the left wall, white L-shaped sofa, light gray walls"

Se c'è una "FOTO UTENTE" analizzata in precedenza, DEVI includere i dettagli strutturali di quella foto nel \`prompt\` (in inglese).
Esempio: "Ristrutturazione di una camera (dalla foto: soffitto alto, finestra ad arco) in stile industriale..."
`;




/**
 * Generate an image using Google's Imagen API (placeholder for now)
 * TODO: Implement actual Imagen 4 API call
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
        const { messages, images, sessionId } = body;

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

        // Append explicit marker if images are present to preserve context in history
        if (images && Array.isArray(images) && images.length > 0) {
            userTextContent += ' [Immagine allegata]';
            console.log('[API] Appended [Immagine allegata] marker to user message');
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
        const { createChatTools } = await import('@/lib/chat-tools');
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
                        model: googleProvider('gemini-3-flash-preview'),
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
                        if (part.type === 'tool-result' && part.toolName === 'generate_render') {
                            const result = (part as any).result || (part as any).output;
                            if (result?.status === 'success' && result?.imageUrl) {
                                // Inject the image as a markdown text chunk
                                // This trick forces the frontend to render the image as part of the message
                                const imageMarkdown = `\n\n![](${result.imageUrl}) \n\n`;
                                console.log('[Stream] Injecting image to stream:', result.imageUrl);
                                writeData('0', imageMarkdown);
                            }
                        }

                        // We also likely need to send tool call info if we want to be "correct", 
                        // but for this specific "Text + Image" requirement, injecting text is safer.
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
