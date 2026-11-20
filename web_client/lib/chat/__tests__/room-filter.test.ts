import type { UIMessage } from 'ai';
import type { Message } from '@/types/chat';
import {
    countMessagesByRoom,
    filterMessagesByRoom,
    resolveMessageRoomId,
} from '@/lib/chat/room-filter';

function uiMsg(id: string, role: 'user' | 'assistant' = 'user', text = 'hi'): UIMessage {
    return { id, role, parts: [{ type: 'text', text }] } as UIMessage;
}

function histMsg(id: string, roomId?: string | null, role: 'user' | 'assistant' = 'user'): Message {
    return { id, role, content: 'hi', roomId };
}

describe('room-filter', () => {
    const historyById = new Map<string, Message>([
        ['m1', histMsg('m1', 'r_bagno', 'user')],
        ['m2', histMsg('m2', 'r_bagno', 'assistant')],
        ['m3', histMsg('m3', 'r_cucina', 'user')],
        ['m4', histMsg('m4', undefined, 'assistant')],
    ]);

    const messages: UIMessage[] = [
        uiMsg('welcome-msg', 'assistant', 'Benvenuto'),
        uiMsg('m1', 'user', 'Rifaccio il bagno'),
        uiMsg('m2', 'assistant', 'Ottimo per il bagno'),
        uiMsg('m3', 'user', 'E la cucina?'),
        uiMsg('m4', 'assistant', 'Riepilogo generale'),
    ];

    it('returns all messages unchanged when filter is "all"', () => {
        const result = filterMessagesByRoom(messages, { filter: 'all', historyById });
        expect(result.map((m) => m.id)).toEqual(['welcome-msg', 'm1', 'm2', 'm3', 'm4']);
    });

    it('filters to only messages belonging to the selected room', () => {
        const result = filterMessagesByRoom(messages, { filter: 'r_bagno', historyById });
        expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('keeps optimistically attributed user messages visible before Firestore snapshot arrives', () => {
        const withLocal = [...messages, uiMsg('local-u1', 'user', 'Nuovo messaggio bagno')];
        const optimisticRoomById = new Map([['local-u1', 'r_bagno']]);

        const bagno = filterMessagesByRoom(withLocal, {
            filter: 'r_bagno',
            historyById,
            optimisticRoomById,
        });
        expect(bagno.map((m) => m.id)).toEqual(['m1', 'm2', 'local-u1']);

        const cucina = filterMessagesByRoom(withLocal, {
            filter: 'r_cucina',
            historyById,
            optimisticRoomById,
        });
        expect(cucina.map((m) => m.id)).toEqual(['m3']);
    });

    it('keeps trailing streaming assistant reply visible in the in-flight room only', () => {
        const streaming = [...messages, uiMsg('stream-a1', 'assistant', 'Sto generando...')];

        const bagno = filterMessagesByRoom(streaming, {
            filter: 'r_bagno',
            historyById,
            isLoading: true,
            inFlightRoomId: 'r_bagno',
        });
        expect(bagno.map((m) => m.id)).toEqual(['m1', 'm2', 'stream-a1']);

        const cucina = filterMessagesByRoom(streaming, {
            filter: 'r_cucina',
            historyById,
            isLoading: true,
            inFlightRoomId: 'r_bagno',
        });
        expect(cucina.map((m) => m.id)).toEqual(['m3']);
    });

    it('prefers Firestore roomId over optimistic roomId when both exist', () => {
        const optimisticRoomById = new Map([['m1', 'r_cucina']]);
        expect(resolveMessageRoomId('m1', historyById, optimisticRoomById)).toBe('r_bagno');
    });

    it('counts user and assistant messages per room ignoring welcome and untagged messages', () => {
        const counts = countMessagesByRoom(messages, historyById);
        expect(counts.get('r_bagno')).toBe(2);
        expect(counts.get('r_cucina')).toBe(1);
        expect(counts.size).toBe(2);
    });
});
