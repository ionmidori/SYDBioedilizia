import { normalizeMessagesForBackend } from '../normalize-messages';

describe('normalizeMessagesForBackend', () => {
    it('forwards the client AI SDK message id so the backend can persist the user row under it', () => {
        const result = normalizeMessagesForBackend([
            { id: 'sdk-user-abc', role: 'user', content: 'Ciao' },
        ]);

        expect(result).toEqual([{ id: 'sdk-user-abc', role: 'user', content: 'Ciao' }]);
    });

    it('forwards the id for parts-based messages, deriving text content from the parts', () => {
        const result = normalizeMessagesForBackend([
            { id: 'sdk-1', role: 'user', parts: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] },
        ]);

        expect(result).toEqual([{ id: 'sdk-1', role: 'user', content: 'Hello world' }]);
    });

    it('omits the id key entirely when the message has no id (avoids sending id: undefined)', () => {
        const result = normalizeMessagesForBackend([
            { role: 'user', content: 'no id here' },
        ]);

        expect(result).toEqual([{ role: 'user', content: 'no id here' }]);
        expect(Object.prototype.hasOwnProperty.call(result[0], 'id')).toBe(false);
    });

    it('filters out tool messages (their data lives inside the assistant message)', () => {
        const result = normalizeMessagesForBackend([
            { id: 'u1', role: 'user', content: 'hi' },
            { id: 't1', role: 'tool', content: 'tool payload' },
            { id: 'a1', role: 'assistant', content: 'hello' },
        ]);

        expect(result).toEqual([
            { id: 'u1', role: 'user', content: 'hi' },
            { id: 'a1', role: 'assistant', content: 'hello' },
        ]);
    });
});
