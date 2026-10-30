import { fetchValidated } from '@/lib/api-client';
import { userChatResponseSchema } from '@/types/user-chat';
import { userChatApi } from '../user-chat-api';

jest.mock('@/lib/api-client', () => ({
    fetchValidated: jest.fn(),
}));

const mockFetchValidated = fetchValidated as jest.Mock;

describe('userChatApi.getMyChat', () => {
    it('asks the backend for the signed-in user’s chat, validated', async () => {
        mockFetchValidated.mockResolvedValue({ chat_id: 'chat-1', created: false });

        await expect(userChatApi.getMyChat()).resolves.toEqual({ chat_id: 'chat-1', created: false });
        expect(mockFetchValidated).toHaveBeenCalledWith(expect.stringMatching(/\/me\/chat$/), userChatResponseSchema);
    });
});
