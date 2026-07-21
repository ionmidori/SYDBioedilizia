import { renderHook } from '@testing-library/react';
import { useChatTransport } from '../useChatTransport';

const mockRefreshToken = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ refreshToken: mockRefreshToken }),
}));

const mockGetAppCheckToken = jest.fn();
jest.mock('firebase/app-check', () => ({
    getToken: (...args: unknown[]) => mockGetAppCheckToken(...args),
}));

jest.mock('@/lib/firebase', () => ({
    auth: { currentUser: null },
    appCheck: {},
}));

// The `ai` package ships ESM and is not in transformIgnorePatterns, so it cannot
// be loaded here. Substituting the transport with a capture class is also the
// point: these tests cover OUR resolver, not the SDK's request machinery.
jest.mock('ai', () => ({
    DefaultChatTransport: class {
        constructor(public options: TransportOptions) { }
    },
}));

interface TransportOptions {
    api: string;
    headers: () => Promise<Record<string, string>>;
    prepareSendMessagesRequest: (args: {
        id: string;
        messages: unknown[];
        body?: Record<string, unknown>;
    }) => { body: Record<string, unknown> };
}

import { auth } from '@/lib/firebase';
const mutableAuth = auth as unknown as { currentUser: { getIdToken: () => Promise<string> } | null };

function buildTransport(sessionId = 's1', currentProjectId: string | null = null) {
    const { result } = renderHook(() => useChatTransport({ sessionId, currentProjectId }));
    return (result.current as unknown as { options: TransportOptions }).options;
}

const resolveHeaders = () => buildTransport().headers();

beforeEach(() => {
    jest.clearAllMocks();
    mutableAuth.currentUser = null;
    delete process.env.NEXT_PUBLIC_ENABLE_APP_CHECK;
});

describe('useChatTransport — auth headers', () => {
    it('sends the bearer token returned by refreshToken', async () => {
        mockRefreshToken.mockResolvedValue('tok-123');

        await expect(resolveHeaders()).resolves.toEqual({ Authorization: 'Bearer tok-123' });
    });

    it('falls back to auth.currentUser when refreshToken returns null', async () => {
        // Bridges the window between signInAnonymously() resolving and React
        // re-rendering — without it the first message 401s.
        mockRefreshToken.mockResolvedValue(null);
        mutableAuth.currentUser = { getIdToken: jest.fn().mockResolvedValue('fallback-tok') };

        await expect(resolveHeaders()).resolves.toEqual({ Authorization: 'Bearer fallback-tok' });
    });

    it('omits Authorization when no token can be obtained', async () => {
        mockRefreshToken.mockResolvedValue(null);

        await expect(resolveHeaders()).resolves.toEqual({});
    });

    it('does not throw when the fallback getIdToken rejects', async () => {
        mockRefreshToken.mockResolvedValue(null);
        mutableAuth.currentUser = { getIdToken: jest.fn().mockRejectedValue(new Error('offline')) };

        await expect(resolveHeaders()).resolves.toEqual({});
    });
});

describe('useChatTransport — App Check', () => {
    beforeEach(() => {
        mockRefreshToken.mockResolvedValue('tok-123');
    });

    it('is skipped unless explicitly enabled', async () => {
        await resolveHeaders();

        expect(mockGetAppCheckToken).not.toHaveBeenCalled();
    });

    it('adds the App Check header when enabled', async () => {
        process.env.NEXT_PUBLIC_ENABLE_APP_CHECK = 'true';
        mockGetAppCheckToken.mockResolvedValue({ token: 'ac-tok' });

        await expect(resolveHeaders()).resolves.toEqual({
            Authorization: 'Bearer tok-123',
            'X-Firebase-AppCheck': 'ac-tok',
        });
    });

    it('still sends the request when App Check fails', async () => {
        process.env.NEXT_PUBLIC_ENABLE_APP_CHECK = 'true';
        mockGetAppCheckToken.mockRejectedValue(new Error('app check down'));

        await expect(resolveHeaders()).resolves.toEqual({ Authorization: 'Bearer tok-123' });
    });
});

describe('useChatTransport — request body', () => {
    it('injects sessionId and projectId', () => {
        const { prepareSendMessagesRequest } = buildTransport('sess-9', 'proj-7');

        const { body } = prepareSendMessagesRequest({ id: 'req-1', messages: [] });

        expect(body).toMatchObject({ id: 'req-1', sessionId: 'sess-9', projectId: 'proj-7' });
    });

    it('preserves per-request body fields from the caller', () => {
        // ChatWidget passes mediaUrls / videoFileUris this way.
        const { prepareSendMessagesRequest } = buildTransport();

        const { body } = prepareSendMessagesRequest({
            id: 'req-1',
            messages: [],
            body: { mediaUrls: ['https://cdn/a.jpg'] },
        });

        expect(body.mediaUrls).toEqual(['https://cdn/a.jpg']);
    });

    it('does not let a caller override sessionId or projectId', () => {
        const { prepareSendMessagesRequest } = buildTransport('sess-9', 'proj-7');

        const { body } = prepareSendMessagesRequest({
            id: 'req-1',
            messages: [],
            body: { sessionId: 'spoofed', projectId: 'spoofed' },
        });

        expect(body).toMatchObject({ sessionId: 'sess-9', projectId: 'proj-7' });
    });
});

describe('useChatTransport — memoisation', () => {
    it('keeps the same transport instance until sessionId or project changes', () => {
        mockRefreshToken.mockResolvedValue('tok');
        const { result, rerender } = renderHook(
            (p: { sessionId: string; currentProjectId: string | null }) => useChatTransport(p),
            { initialProps: { sessionId: 's1', currentProjectId: null } }
        );

        const first = result.current;
        rerender({ sessionId: 's1', currentProjectId: null });
        expect(result.current).toBe(first);

        // A new transport is required, otherwise requests keep the old sessionId.
        rerender({ sessionId: 's2', currentProjectId: null });
        expect(result.current).not.toBe(first);
    });
});
