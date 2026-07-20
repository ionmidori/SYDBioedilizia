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
    const resolveHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = {};

        // Primary: use the managed refreshToken (uses auth.currentUser || user state)
        let token = await refreshToken();

        // ⚡ Fallback: If refreshToken returned null (e.g. state hasn't re-rendered yet after
        // anonymous sign-in), try auth.currentUser directly from the Firebase SDK.
        // This bridges the window between signInAnonymously() resolving and React re-rendering.
        if (!token && auth.currentUser) {
            logger.debug('[ChatProvider] refreshToken returned null, falling back to auth.currentUser.getIdToken()');
            try {
                token = await auth.currentUser.getIdToken();
            } catch (fallbackErr) {
                console.error('[ChatProvider] Fallback getIdToken failed:', fallbackErr);
            }
        }

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('[ChatProvider] ⚠️ No token available for Authorization header — request may fail with 401');
        }

        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true' && appCheck) {
            try {
                const result = await getToken(appCheck, false);
                if (result.token) {
                    headers['X-Firebase-AppCheck'] = result.token;
                }
            } catch (err) {
                console.error('[ChatProvider] App Check token error:', err);
            }
        }
        return headers;
    }, [refreshToken]);

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
