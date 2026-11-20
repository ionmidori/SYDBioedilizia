import React from 'react';
import { act, render } from '@testing-library/react';
import { ChatProvider } from '../ChatProvider';
import { useChatContext } from '@/hooks/useChatContext';
import type { ChatContextType } from '@/types/chat-context';

const mockSdkSendMessage = jest.fn();
const mockSdkMessages: { current: unknown[] } = { current: [] };
const mockActiveRoom: { current: string | null } = { current: null };

jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'u1', isAnonymous: false }, signInAnonymously: jest.fn() }),
}));
jest.mock('@/hooks/useChatSession', () => ({
    useChatSession: () => ({
        sessionId: 'sess-1',
        userChatId: 'proj-1',
        userChatError: undefined,
        refreshUserChat: jest.fn(),
        resetToNewGuestSession: jest.fn(),
    }),
}));
jest.mock('@/hooks/useAdkStreamEvents', () => ({ useAdkStreamEvents: () => ({ streamData: [], onData: jest.fn() }) }));
jest.mock('@/hooks/useChatHistory', () => ({
    useChatHistory: () => ({ historyMessages: [], historyLoaded: true, loadedForSessionId: 'sess-1' }),
}));
jest.mock('@/hooks/useProjectRooms', () => ({ useProjectRooms: () => ({ rooms: [] }) }));
jest.mock('@/hooks/useActiveRoom', () => ({
    useActiveRoom: () => ({ activeRoomId: mockActiveRoom.current, setActiveRoomId: jest.fn() }),
}));
jest.mock('@/hooks/useChatTransport', () => ({ useChatTransport: () => ({}) }));
jest.mock('@/hooks/use-house-quote', () => ({ useRefreshHouseQuote: () => jest.fn() }));
jest.mock('@/hooks/use-confirmations', () => ({ useRefreshConfirmations: () => jest.fn() }));
jest.mock('@ai-sdk/react', () => ({
    useChat: () => ({
        messages: mockSdkMessages.current,
        status: 'ready',
        sendMessage: mockSdkSendMessage,
        regenerate: jest.fn(),
        stop: jest.fn(),
        setMessages: jest.fn(),
        error: undefined,
    }),
}));
jest.mock('@/hooks/useChatSync', () => ({ useChatSync: jest.fn() }));
const mockRecovery: { lastTurn: (() => unknown) | null } = { lastTurn: null };
jest.mock('@/hooks/useChatMoveRecovery', () => ({
    useChatMoveRecovery: (args: { lastTurn: () => unknown }) => {
        mockRecovery.lastTurn = args.lastTurn;
        return { visibleError: undefined };
    },
}));
jest.mock('@/components/auth/GlobalAuthListener', () => ({ GlobalAuthListener: () => null }));
jest.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

function mount() {
    let ctx: ChatContextType | null = null;
    function Consumer() {
        ctx = useChatContext();
        return null;
    }
    render(
        <ChatProvider>
            <Consumer />
        </ChatProvider>,
    );
    return () => ctx!;
}

describe('ChatProvider.sendSignal (the card confirmed: the agent restarts by itself)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSdkMessages.current = [];
        mockActiveRoom.current = null;
        mockSdkSendMessage.mockResolvedValue(undefined);
    });

    test('sends a hidden message with the event in the body (AI SDK v7: text + metadata, options.body)', async () => {
        const getCtx = mount();
        await act(async () => {
            await getCtx().sendSignal('card_confirmed');
        });

        expect(mockSdkSendMessage).toHaveBeenCalledTimes(1);
        const [message, options] = mockSdkSendMessage.mock.calls[0];
        expect(message).toEqual({ text: expect.any(String), metadata: { hidden: true } });
        expect(message.text.trim()).not.toBe('');
        expect(options).toEqual({ body: { event: 'card_confirmed' } });
    });

    test('carries the room the client is in, like any turn', async () => {
        mockActiveRoom.current = 'r-bagno';
        const getCtx = mount();
        await act(async () => {
            await getCtx().sendSignal('card_confirmed');
        });
        expect(mockSdkSendMessage.mock.calls[0][1]).toEqual({ body: { event: 'card_confirmed', roomId: 'r-bagno' } });
    });

    test('never shows the signal: the messages of the context leave it out', () => {
        mockSdkMessages.current = [
            { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'ciao' }] },
            { id: 'h1', role: 'user', parts: [{ type: 'text', text: 'segnale' }], metadata: { hidden: true } },
            { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'risposta' }] },
        ];
        const getCtx = mount();
        expect(getCtx().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    });

    test('a refused signal never sends the previous turn again (the move recovery reads the last turn)', async () => {
        const getCtx = mount();
        await act(async () => {
            await getCtx().sendMessage('Bagno 6 mq');
        });
        expect(mockRecovery.lastTurn?.()).toMatchObject({ content: 'Bagno 6 mq' });

        await act(async () => {
            await getCtx().sendSignal('card_confirmed');
        });
        expect(mockRecovery.lastTurn?.()).toBeNull();
    });
});
