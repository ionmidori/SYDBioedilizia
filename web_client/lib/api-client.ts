import { auth } from '@/lib/firebase';
import { LeadData, LeadSubmissionResponse } from '@/types/lead';
import { Message } from '@/types/chat';

interface FetchOptions extends RequestInit {
    /**
     * If true, suppresses the automatic injection of the Authorization header.
     */
    skipAuth?: boolean;
}

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Response Types (Synchronized with backend_python/src/api/upload.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ImageUploadResponse {
    public_url: string;
    signed_url: string;
    file_path: string;
    mime_type: string;
    size_bytes: number;
}

export interface VideoUploadResponse {
    file_uri: string;
    mime_type: string;
    display_name: string;
    state: string;
    size_bytes: number;
}

export interface ChatHistoryResponse {
    messages: Message[];
    has_more: boolean;
    next_cursor?: string;
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
                console.log('[ApiClient] Token retrieved:', token.substring(0, 10) + '...');
                finalHeaders['Authorization'] = `Bearer ${token}`;
            } catch (error) {
                console.error('[ApiClient] Failed to get ID token:', error);
            }
        } else {
            console.warn('[ApiClient] No current user found for authenticated request');
        }
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lead API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Submit a lead to the Python backend.
 */
export async function submitLead(data: LeadData): Promise<LeadSubmissionResponse> {
    const response = await fetchWithAuth(`${API_ROOT}/submit-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[ApiClient] submitLead failed:', response.status, errorText);
        throw new Error('Impossibile inviare i dati del lead');
    }

    return response.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Media Upload API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Upload an image to the Python backend (Firebase Storage via backend).
 */
export async function uploadImage(file: File, sessionId: string): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    const response = await fetchWithAuth(`${API_ROOT}/upload/image`, {
        method: 'POST',
        body: formData,
        // Note: Don't set Content-Type header - browser sets it with boundary for FormData
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[ApiClient] uploadImage failed:', response.status, errorText);

        if (response.status === 429) {
            throw new Error('Limite di upload raggiunto. Riprova domani.');
        }
        if (response.status === 413) {
            throw new Error('Immagine troppo grande. Massimo 10MB.');
        }
        if (response.status === 415) {
            throw new Error('Tipo di file non supportato.');
        }

        throw new Error('Errore durante il caricamento dell\'immagine');
    }

    return response.json();
}

/**
 * Upload a video to the Python backend (Google AI File API).
 */
export async function uploadVideo(file: File): Promise<VideoUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetchWithAuth(`${API_ROOT}/upload/video`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[ApiClient] uploadVideo failed:', response.status, errorText);

        if (response.status === 429) {
            throw new Error('Limite di upload video raggiunto. Riprova domani.');
        }
        if (response.status === 413) {
            throw new Error('Video troppo grande. Massimo 100MB.');
        }

        throw new Error('Errore durante il caricamento del video');
    }

    return response.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Chat History API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fetch chat history from the Python backend.
 */
export async function getChatHistory(
    sessionId: string,
    cursor?: string,
    limit: number = 50
): Promise<ChatHistoryResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) {
        params.append('cursor', cursor);
    }

    const response = await fetchWithAuth(
        `${API_ROOT}/sessions/${sessionId}/messages?${params.toString()}`
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[ApiClient] getChatHistory failed:', response.status, errorText);
        throw new Error('Impossibile caricare la cronologia chat');
    }

    return response.json();
}
