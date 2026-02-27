import { auth, appCheck } from '@/lib/firebase';
import { getToken } from 'firebase/app-check';

interface FetchOptions extends RequestInit {
    /**
     * If true, suppresses the automatic injection of the Authorization header.
     */
    skipAuth?: boolean;
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
        if (!appCheck) {
            console.error('[ApiClient] ❌ Header Injection Blocked: appCheck instance is null. Site key might be missing.');
        } else {
            try {
                const result = await getToken(appCheck, false);
                if (result.token) {
                    finalHeaders['X-Firebase-AppCheck'] = result.token;
                    // console.debug('[ApiClient] 🔐 App Check token injected');
                } else {
                    console.warn('[ApiClient] ⚠️ App Check token is empty!');
                }
            } catch (error) {
                console.error('[ApiClient] ❌ App Check token retrieval failed:', error);
            }
        }
    } else {
        // console.debug('[ApiClient] 🛡️ App Check injection skipped (Disabled via Env)');
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
