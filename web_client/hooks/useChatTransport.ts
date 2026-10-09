import { useCallback, useMemo } from 'react';
import { DefaultChatTransport, type UIMessage as Message } from 'ai';
import { getToken } from 'firebase/app-check';
import { useAuth } from '@/hooks/useAuth';
import { auth, appCheck } from '@/lib/firebase';
import { getMessageText } from '@/lib/chat/messages';
import { logger } from '@/lib/logger';

interface UseChatTransportOptions {
    sessionId: string;
    currentProjectId: string | null;
}

/**
 * Build the AI SDK transport: authenticated headers plus the request body
 * enrichment that every chat call needs (sessionId / projectId).
 */
export function useChatTransport({
    sessionId,
    currentProjectId,
}: UseChatTransportOptions): DefaultChatTransport<Message> {
    const { refreshToken } = useAuth();

    // -- DYNAMIC HEADERS/BODY RESOLVER --
    // AI SDK v7: transport headers/body can be async functions (Resolvable)
    // The ID token comes straight from the Firebase SDK, which caches it and
    // refreshes it only when it is about to expire. `refreshToken()` is NOT on
    // this path: it also awaits the `setAuthCookie` server action (a round trip
    // to Next.js before the chat request could even start), and the cookie is
    // already kept in sync by AuthProvider on every token change.
    const getBearerToken = useCallback(async (): Promise<string | null> => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            try {
                return await currentUser.getIdToken();
            } catch (err) {
                console.error('[ChatProvider] getIdToken failed:', err);
            }
        }
        // Rare: React state holds the user before auth.currentUser is set
        // (right after signInAnonymously). refreshToken() falls back to it.
        logger.debug('[ChatProvider] auth.currentUser unavailable, falling back to refreshToken()');
        return refreshToken();
    }, [refreshToken]);

    const getAppCheckToken = useCallback(async (): Promise<string | null> => {
        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK !== 'true' || !appCheck) return null;
        try {
            const result = await getToken(appCheck, false);
            return result.token || null;
        } catch (err) {
            console.error('[ChatProvider] App Check token error:', err);
            return null;
        }
    }, []);

    const resolveHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = {};
        // Independent: fetched in parallel.
        const [token, appCheckToken] = await Promise.all([getBearerToken(), getAppCheckToken()]);

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('[ChatProvider] ⚠️ No token available for Authorization header — request may fail with 401');
        }
        if (appCheckToken) {
            headers['X-Firebase-AppCheck'] = appCheckToken;
        }
        return headers;
    }, [getBearerToken, getAppCheckToken]);

    // NOTE: DefaultChatTransport does NOT accept `body` as a function.
    // Dynamic body fields must be injected via `prepareSendMessagesRequest`.
    return useMemo(() => new DefaultChatTransport<Message>({
        api: '/api/chat',
        headers: resolveHeaders,
        prepareSendMessagesRequest: ({ id, messages, body: sdkBody }) => {
            // sdkBody = { ...transport.body (static), ...options.body (per-request) }
            // options.body carries mediaUrls, mediaMetadata, videoFileUris from ChatWidget.
            const extra = (sdkBody ?? {}) as Record<string, unknown>;
            const body: Record<string, unknown> = {
                id,
                messages,
                ...extra,
                projectId: currentProjectId,
                sessionId,
            };

            const msgs = body.messages as Message[];
            const lastMsg = msgs?.[msgs.length - 1];
            const lastMsgContent = getMessageText(lastMsg);

            if (process.env.NODE_ENV === 'development') {
                logger.debug('[ChatProvider] prepareSendMessagesRequest body:', JSON.stringify({
                    sessionId: body.sessionId,
                    messagesCount: msgs?.length,
                    projectId: body.projectId,
                    lastMessageRole: lastMsg?.role,
                    lastMessageContent: String(lastMsgContent).substring(0, 50),
                    mediaUrlsCount: Array.isArray(body.mediaUrls) ? (body.mediaUrls as unknown[]).length : 0,
                }));
            }
            return { body };
        },
    }), [resolveHeaders, currentProjectId, sessionId]);
}
