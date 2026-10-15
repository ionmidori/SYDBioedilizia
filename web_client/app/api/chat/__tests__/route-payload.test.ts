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
