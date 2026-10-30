import { buildBackendPayload } from '../backend-payload';

describe('buildBackendPayload', () => {
    const base = {
        messages: [{ id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'ciao' }] }],
        sessionId: 's1',
    };

    test('forwards the attached video URIs to the backend', () => {
        const uri = 'gs://bucket/user-uploads/s1/clip.mp4';
        expect(buildBackendPayload({ ...base, videoFileUris: [uri] }).videoFileUris).toEqual([uri]);
    });

    test('defaults every media field when absent', () => {
        const payload = buildBackendPayload(base);
        expect(payload).toMatchObject({
            sessionId: 's1',
            is_authenticated: false,
            imageUrls: [],
            mediaUrls: [],
            mediaTypes: [],
            mediaMetadata: {},
            videoFileUris: [],
        });
        expect(payload.messages).toHaveLength(1);
    });
});

describe('buildBackendPayload — rooms (Phase 138)', () => {
    const base = {
        messages: [{ id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'ciao' }] }],
        sessionId: 's1',
    };

    test('forwards the room of the turn', () => {
        expect(buildBackendPayload({ ...base, roomId: 'r_bagno' }).roomId).toBe('r_bagno');
    });

    test('sends null without a room', () => {
        expect(buildBackendPayload(base).roomId).toBeNull();
    });
});

describe('buildBackendPayload — the chat is the project (Phase 139)', () => {
    test('sends no projectId, even from an old client that still posts one', () => {
        const payload = buildBackendPayload({
            messages: [],
            sessionId: 's1',
            ...({ projectId: 'other-chat' } as object),
        });

        expect(payload).not.toHaveProperty('projectId');
        expect(payload.sessionId).toBe('s1');
    });
});
