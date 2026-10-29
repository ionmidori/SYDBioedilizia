import { userChatResponseSchema } from '../user-chat';

describe('userChatResponseSchema (Golden Sync with schemas/user_chat.py)', () => {
    it('parses the backend response', () => {
        // UserChatResponse.model_dump(mode="json")
        const payload = { chat_id: '0a1b2c3d-1111-2222-3333-444455556666', created: true };

        expect(userChatResponseSchema.parse(payload)).toEqual(payload);
    });

    it('rejects a response without the chat id', () => {
        expect(() => userChatResponseSchema.parse({ created: false })).toThrow();
    });

    it('rejects unknown fields (the backend forbids extras)', () => {
        expect(() => userChatResponseSchema.parse({ chat_id: 'c', created: false, owner: 'u' })).toThrow();
    });
});
