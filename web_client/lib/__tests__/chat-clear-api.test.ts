import { fetchValidated } from '@/lib/api-client';
import { clearChatResponseSchema } from '@/types/chat-clear';
import { chatClearApi } from '../chat-clear-api';

jest.mock('@/lib/api-client', () => ({
    fetchValidated: jest.fn(),
}));

const mockFetchValidated = fetchValidated as jest.Mock;

describe('chatClearApi.clearChat', () => {
    beforeEach(() => {
        mockFetchValidated.mockReset();
    });

    it('calls fetchValidated with POST /chat/{sessionId}/clear and room_id body', async () => {
        const expectedResponse = {
            mode: 'soft_archive' as const,
            room_id: 'bagno',
            affected_count: 4,
            rooms_reset: 1,
        };
        mockFetchValidated.mockResolvedValue(expectedResponse);

        await expect(chatClearApi.clearChat('sess-1', { room_id: 'bagno' })).resolves.toEqual(expectedResponse);

        expect(mockFetchValidated).toHaveBeenCalledTimes(1);
        const [url, schema, options] = mockFetchValidated.mock.calls[0];
        expect(url).toMatch(/\/chat\/sess-1\/clear$/);
        expect(schema).toBe(clearChatResponseSchema);
        expect(options).toMatchObject({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        expect(JSON.parse(options.body)).toEqual({ room_id: 'bagno' });
    });

    it('defaults request body to { room_id: null } when omitted and encodes sessionId', async () => {
        const expectedResponse = {
            mode: 'hard_delete' as const,
            room_id: null,
            affected_count: 2,
            rooms_reset: 0,
        };
        mockFetchValidated.mockResolvedValue(expectedResponse);

        await expect(chatClearApi.clearChat('sess 1')).resolves.toEqual(expectedResponse);

        const [url, schema, options] = mockFetchValidated.mock.calls[0];
        expect(url).toMatch(/\/chat\/sess%201\/clear$/);
        expect(schema).toBe(clearChatResponseSchema);
        expect(JSON.parse(options.body)).toEqual({ room_id: null });
    });

    it('rejects invalid room_id before issuing fetch', async () => {
        await expect(chatClearApi.clearChat('sess-1', { room_id: 'bad room!' })).rejects.toThrow();
        await expect(chatClearApi.clearChat('sess-1', { room_id: '' })).rejects.toThrow();

        expect(mockFetchValidated).not.toHaveBeenCalled();
    });
});
