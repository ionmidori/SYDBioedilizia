import { auth, appCheck } from '@/lib/firebase';
import { getToken } from 'firebase/app-check';

interface FetchOptions extends RequestInit {
    /**
     * If true, suppresses the automatic injection of the Authorization header.
     */
    skipAuth?: boolean;
}

/**
 * App Check header for a backend call.
 *
 * Safari on iPhone failed every token request (reCAPTCHA), and the request went
 * out without a header: the dashboard showed "Missing App Check token". One retry
 * with a forced refresh; if that fails too, `X-AppCheck-Error` carries the SDK
 * error code so the backend log says WHY the token is missing.
 */
async function getAppCheckHeader(): Promise<Record<string, string>> {
    if (!appCheck) {
        console.error('[ApiClient] ❌ Header Injection Blocked: appCheck instance is null. Site key might be missing.');
        return { 'X-AppCheck-Error': 'no-instance' };
    }
    let lastError = 'empty-token';
    for (const forceRefresh of [false, true]) {
        try {
            const result = await getToken(appCheck, forceRefresh);
            if (result.token) return { 'X-Firebase-AppCheck': result.token };
            console.warn('[ApiClient] ⚠️ App Check token is empty!');
            lastError = 'empty-token';
        } catch (error) {
            console.error('[ApiClient] ❌ App Check token retrieval failed:', error);
            const code = (error as { code?: unknown })?.code;
            lastError = typeof code === 'string' ? code : (error as Error)?.name ?? 'unknown';
        }
    }
    return { 'X-AppCheck-Error': lastError.slice(0, 80) };
}

/**
 * User-facing text for a backend error body (APIErrorResponse) or any thrown value.
 * App Check rejections are a device/browser problem, not something the user can
 * read in technical terms.
 */
export function describeApiError(error: unknown): string {
    const body = error as { error_code?: unknown; message?: unknown } | null | undefined;
    if (body?.error_code === 'APP_CHECK_FAILED') {
        return 'La verifica di sicurezza del browser non è riuscita. Ricarica la pagina; se il problema continua, disattiva i blocchi dei contenuti per questo sito.';
    }
    return typeof body?.message === 'string' && body.message ? body.message : 'Errore di caricamento. Riprova.';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Fetch Utility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Authenticated API Client
 * 
 * Automatically injects the Firebase ID Token into the 'Authorization' header.
 * Use this instead of raw 'fetch' for all backend API calls.
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
    const { skipAuth, headers, ...rest } = options;

    // Prepare headers object
    const finalHeaders: Record<string, string> = {};

    // Copy existing headers
    if (headers) {
        if (headers instanceof Headers) {
            headers.forEach((val, key) => { finalHeaders[key] = val; });
        } else if (Array.isArray(headers)) {
            headers.forEach(([key, val]) => { finalHeaders[key] = val; });
        } else {
            Object.assign(finalHeaders, headers);
        }
    }

    // Inject Authorization Token
    if (!skipAuth) {
        const user = auth.currentUser;
        if (user) {
            try {
                const token = await user.getIdToken();
                finalHeaders['Authorization'] = `Bearer ${token}`;
            } catch (error) {
                console.error('[ApiClient] Failed to get ID token:', error);
            }
        }
    }

    // Inject App Check Token (⚡ Production Protection)
    if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
        const appCheckHeader = await getAppCheckHeader();
        Object.assign(finalHeaders, appCheckHeader);
    }

    // Execute Request
    const response = await fetch(url, {
        ...rest,
        headers: finalHeaders,
        cache: 'no-store' // ⚡ CRITICAL: Prevent Next.js/Vercel buffering
    });

    // Global Error Handling
    if (response.status === 401) {
        console.warn('[ApiClient] 401 Unauthorized - Token might be invalid or expired.');
    }

    return response;
}

import { z } from 'zod';

/**
 * Validated API Client
 * 
 * Wraps fetchWithAuth and validates the JSON response using a Zod schema.
 * Throws a structured error if validation fails.
 */
export async function fetchValidated<S extends z.ZodTypeAny>(
    url: string,
    schema: S,
    options: FetchOptions = {}
): Promise<z.output<S>> {
    const response = await fetchWithAuth(url, options);
    
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { message: 'Network response was not ok', status: response.status };
        }
        throw errorData; // Typically APIErrorResponse format from backend
    }
    
    const data = await response.json();
    
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('[ApiClient] Validation Error on URL:', url);
            console.error(error.format());
            // Throw a structured error that UI can handle
            throw {
                error_code: 'VALIDATION_ERROR',
                message: 'Invalid data received from server',
                details: error.format()
            };
        }
        throw error;
    }
}



