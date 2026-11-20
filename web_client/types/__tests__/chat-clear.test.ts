import { clearChatRequestSchema, clearChatResponseSchema } from '../chat-clear';

describe('chat-clear schemas (Golden Sync with schemas/chat_clear.py)', () => {
    it('parses full-chat and room-scoped requests', () => {
        expect(clearChatRequestSchema.parse({})).toEqual({});
        expect(clearChatRequestSchema.parse({ room_id: null })).toEqual({ room_id: null });
        expect(clearChatRequestSchema.parse({ room_id: 'bagno_1' })).toEqual({ room_id: 'bagno_1' });
    });

    it('rejects invalid room_id and unknown fields', () => {
        expect(() => clearChatRequestSchema.parse({ room_id: '../bad' })).toThrow();
        expect(() => clearChatRequestSchema.parse({ room_id: null, foo: 1 })).toThrow();
    });

    it('parses both response modes and rejects negative counts or unknown fields', () => {
        const payload = { mode: 'soft_archive', room_id: 'bagno_1', affected_count: 3, rooms_reset: 1 };
        expect(clearChatResponseSchema.parse(payload)).toEqual(payload);
        expect(
            clearChatResponseSchema.parse({ mode: 'hard_delete', room_id: null, affected_count: 0, rooms_reset: 0 }),
        ).toEqual({ mode: 'hard_delete', room_id: null, affected_count: 0, rooms_reset: 0 });
        expect(() => clearChatResponseSchema.parse({ ...payload, affected_count: -1 })).toThrow();
        expect(() => clearChatResponseSchema.parse({ ...payload, extra: true })).toThrow();
    });
});
