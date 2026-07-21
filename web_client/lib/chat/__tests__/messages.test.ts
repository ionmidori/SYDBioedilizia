import type { UIMessage as Message } from 'ai';
import type { Message as FirestoreMessage } from '@/types/chat';
import {
    WELCOME_MESSAGE,
    buildFullHistory,
    getMessageText,
    historyToUIMessage,
} from '../messages';

/** Build a v7-shaped message without fighting the SDK's generic types. */
function uiMessage(parts: unknown[], id = 'm1'): Message {
    return { id, role: 'assistant', parts } as unknown as Message;
}

describe('historyToUIMessage', () => {
    it('converts a text row into a single text part', () => {
        const msg = historyToUIMessage({ id: 'a', role: 'user', content: 'ciao' });
        expect(msg.id).toBe('a');
        expect(msg.role).toBe('user');
        expect(msg.parts).toEqual([{ type: 'text', text: 'ciao' }]);
    });

    it('always emits at least one part for empty content', () => {
        // An assistant message with zero parts renders as a stuck "thinking" bubble.
        const msg = historyToUIMessage({ id: 'a', role: 'assistant', content: '' });
        expect(msg.parts).toEqual([{ type: 'text', text: '' }]);
    });

    it('appends a file part per image attachment', () => {
        const msg = historyToUIMessage({
            id: 'a',
            role: 'user',
            content: 'guarda',
            attachments: { images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'] },
        });
        expect(msg.parts).toEqual([
            { type: 'text', text: 'guarda' },
            { type: 'file', mediaType: 'image/jpeg', url: 'https://cdn/a.jpg' },
            { type: 'file', mediaType: 'image/jpeg', url: 'https://cdn/b.jpg' },
        ]);
    });

    it('skips non-string attachment urls', () => {
        const msg = historyToUIMessage({
            id: 'a',
            role: 'user',
            content: '',
            attachments: { images: [null, 42] as unknown as string[] },
        });
        expect(msg.parts).toEqual([{ type: 'text', text: '' }]);
    });

    it('ignores non-string content', () => {
        const msg = historyToUIMessage({ id: 'a', role: 'user', content: { foo: 1 } });
        expect(msg.parts).toEqual([{ type: 'text', text: '' }]);
    });
});

describe('getMessageText', () => {
    it('prefers a flat string content (legacy/Firestore shape)', () => {
        const msg = { id: 'a', content: 'legacy', parts: [{ type: 'text', text: 'ignored' }] };
        expect(getMessageText(msg as unknown as Message)).toBe('legacy');
    });

    it('falls back to the first part text (v7 shape)', () => {
        expect(getMessageText(uiMessage([{ type: 'text', text: 'v7' }]))).toBe('v7');
    });

    it('returns an empty string for a file-only message', () => {
        expect(getMessageText(uiMessage([{ type: 'file', url: 'https://cdn/a.jpg' }]))).toBe('');
    });

    it('returns an empty string for empty parts', () => {
        expect(getMessageText(uiMessage([]))).toBe('');
    });

    it('returns an empty string for null/undefined', () => {
        expect(getMessageText(undefined)).toBe('');
        expect(getMessageText(null)).toBe('');
    });
});

describe('buildFullHistory', () => {
    const rows = [
        { id: 'u1', role: 'user', content: 'ciao' },
        { id: 't1', role: 'tool', content: '{"ok":true}' },
        { id: 'a1', role: 'assistant', content: 'ecco' },
    ] as unknown as FirestoreMessage[];

    it('prepends the welcome message', () => {
        expect(buildFullHistory([])).toEqual([WELCOME_MESSAGE]);
    });

    it('drops standalone tool rows (tool data lives inside the assistant message)', () => {
        const full = buildFullHistory(rows);
        expect(full.map((m) => m.id)).toEqual(['welcome-msg', 'u1', 'a1']);
    });

    it('converts every row to a parts-carrying message', () => {
        for (const msg of buildFullHistory(rows)) {
            expect(Array.isArray(msg.parts)).toBe(true);
            expect(msg.parts.length).toBeGreaterThan(0);
        }
    });
});
