import { streamText } from 'ai';

/**
 * ✅ CRITICAL FIX #3: AI timeout and rate limit handling
 * Helper function to call AI with retry logic and timeout
 */
const MAX_RETRIES = 2;
const TIMEOUT_MS = 45000; // 45 seconds

async function callAIWithRetry(config: any, retries = 0): Promise<any> {
    try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const streamPromise = Promise.resolve().then(() =>
            streamText({ ...config, abortSignal: controller.signal })
        );

        const result = await Promise.race([
            streamPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('AI_TIMEOUT')), TIMEOUT_MS)
            )
        ]);

        clearTimeout(timeoutId);
        return result;

    } catch (error: any) {
        // Handle timeout errors
        if (error.message === 'AI_TIMEOUT' && retries < MAX_RETRIES) {
            console.warn(`[AI] Timeout, retrying (${retries + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
            return callAIWithRetry(config, retries + 1);
        }

        // Handle rate limit (429) errors
        if (error.status === 429 && retries < MAX_RETRIES) {
            const retryAfter = parseInt(error.headers?.['retry-after'] || '5');
            console.warn(`[AI] Rate limited, waiting ${retryAfter}s before retry`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return callAIWithRetry(config, retries + 1);
        }

        // Throw user-friendly error
        if (error.status === 429) {
            throw new Error('Il servizio è temporaneamente sovraccarico. Riprova tra qualche minuto.');
        }
        if (error.message === 'AI_TIMEOUT') {
            throw new Error('La richiesta ha impiegato troppo tempo. Riprova.');
        }
        throw error;
    }
}

export { callAIWithRetry };
