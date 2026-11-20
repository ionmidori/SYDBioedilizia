import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { ChatProvider } from '../ChatProvider';
import { useChatContext } from '@/hooks/useChatContext';
import { WELCOME_MESSAGE } from '@/lib/chat/messages';
import type { ChatContextType } from '@/types/chat-context';
import type { ClearChatResponse } from '@/types/chat-clear';
import type { Message } from '@/types/chat';

const mockSessionId: { current: string | null } = { current: 'sess-1' };
const mockHistoryMessages: { current: Message[] } = { current: [] };
const mockSetMessages = jest.fn();
const mockUseChatSync = jest.fn();
const mockClearChatApi = jest.fn();

jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'u1', isAnonymous: false },
        signInAnonymously: jest.fn(),
    }),
}));

jest.mock('@/hooks/useChatSession', () => ({
    useChatSession: () => ({
        sessionId: mockSessionId.current,
        userChatId: 'proj-1',
        userChatError: undefined,
        refreshUserChat: jest.fn(),
        resetToNewGuestSession: jest.fn(),
    }),
}));

jest.mock('@/hooks/useAdkStreamEvents', () => ({
    useAdkStreamEvents: () => ({
        streamData: [],
        onData: jest.fn(),
    }),
}));

jest.mock('@/hooks/useChatHistory', () => ({
    useChatHistory: () => ({
        historyMessages: mockHistoryMessages.current,
        historyLoaded: true,
        loadedForSessionId: mockSessionId.current ?? undefined,
    }),
}));

jest.mock('@/hooks/useProjectRooms', () => ({
    useProjectRooms: () => ({ rooms: [] }),
}));

jest.mock('@/hooks/useActiveRoom', () => ({
    useActiveRoom: () => ({ activeRoomId: null, setActiveRoomId: jest.fn() }),
}));

jest.mock('@/hooks/useChatTransport', () => ({
    useChatTransport: () => ({}),
}));

jest.mock('@/hooks/use-house-quote', () => ({
    useRefreshHouseQuote: () => jest.fn(),
}));

jest.mock('@/hooks/use-confirmations', () => ({
    useRefreshConfirmations: () => jest.fn(),
}));

jest.mock('@ai-sdk/react', () => ({
    useChat: () => ({
        messages: [],
        status: 'ready',
        sendMessage: jest.fn(),
        regenerate: jest.fn(),
        stop: jest.fn(),
        setMessages: mockSetMessages,
        error: undefined,
    }),
}));

jest.mock('@/hooks/useChatSync', () => ({
    useChatSync: (args: Record<string, unknown>) => mockUseChatSync(args),
}));

jest.mock('@/hooks/useChatMoveRecovery', () => ({
    useChatMoveRecovery: () => ({ visibleError: undefined }),
}));

jest.mock('@/components/auth/GlobalAuthListener', () => ({
    GlobalAuthListener: () => null,
}));

jest.mock('@/lib/firebase', () => ({
    auth: { currentUser: null },
}));

jest.mock('@/lib/chat-clear-api', () => ({
    chatClearApi: {
        clearChat: (...args: unknown[]) => mockClearChatApi(...args),
    },
}));

describe('ChatProvider.clearChat', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSessionId.current = 'sess-1';
        mockHistoryMessages.current = [];
        mockClearChatApi.mockResolvedValue({
            mode: 'soft_archive',
            room_id: 'r-bagno',
            affected_count: 2,
            rooms_reset: 1,
        } satisfies ClearChatResponse);
    });

    function mountProvider() {
        let latestCtx: ChatContextType | null = null;
        function Consumer() {
            latestCtx = useChatContext();
            return null;
        }
        const view = render(
            <ChatProvider>
                <Consumer />
            </ChatProvider>,
        );
        return {
            view,
            getCtx: () => latestCtx!,
            rerender: () =>
                view.rerender(
                    <ChatProvider>
                        <Consumer />
                    </ChatProvider>,
                ),
        };
    }

    test('filters only room messages and bumps clearGeneration for room-scoped clear', async () => {
        mockHistoryMessages.current = [
            { id: 'm1', role: 'user', content: 'Bagno', roomId: 'r-bagno' },
            { id: 'm2', role: 'assistant', content: 'Cucina', roomId: 'r-cucina' },
            { id: 'm3', role: 'assistant', content: 'Generale' },
        ];

        const { getCtx } = mountProvider();
        const initialGen = (mockUseChatSync.mock.calls.at(-1)?.[0] as { clearGeneration: number }).clearGeneration;

        await act(async () => {
            await getCtx().clearChat('r-bagno');
        });

        expect(mockClearChatApi).toHaveBeenCalledWith('sess-1', { room_id: 'r-bagno' });
        expect(mockSetMessages).toHaveBeenCalledTimes(1);
        const updater = mockSetMessages.mock.calls[0][0] as (prev: Array<{ id: string }>) => Array<{ id: string }>;
        expect(updater([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }])).toEqual([{ id: 'm2' }, { id: 'm3' }]);

        const nextGen = (mockUseChatSync.mock.calls.at(-1)?.[0] as { clearGeneration: number }).clearGeneration;
        expect(nextGen).toBe(initialGen + 1);
    });

    test('resets messages to WELCOME_MESSAGE and bumps clearGeneration for full clear', async () => {
        const { getCtx } = mountProvider();
        const initialGen = (mockUseChatSync.mock.calls.at(-1)?.[0] as { clearGeneration: number }).clearGeneration;

        await act(async () => {
            await getCtx().clearChat(null);
        });

        expect(mockClearChatApi).toHaveBeenCalledWith('sess-1', { room_id: null });
        expect(mockSetMessages).toHaveBeenCalledWith([WELCOME_MESSAGE]);

        const nextGen = (mockUseChatSync.mock.calls.at(-1)?.[0] as { clearGeneration: number }).clearGeneration;
        expect(nextGen).toBe(initialGen + 1);
    });

    test('does not mutate state if sessionId changes while clearChat is in flight', async () => {
        let resolveClear!: (val: ClearChatResponse) => void;
        const pendingClear = new Promise<ClearChatResponse>((resolve) => {
            resolveClear = resolve;
        });
        mockClearChatApi.mockReturnValueOnce(pendingClear);

        const { getCtx, rerender } = mountProvider();
        const initialGen = (mockUseChatSync.mock.calls.at(-1)?.[0] as { clearGeneration: number }).clearGeneration;

        const clearPromise = getCtx().clearChat(null);
        expect(mockClearChatApi).toHaveBeenCalledWith('sess-1', { room_id: null });

        // Switch session before clearChat resolves
        mockSessionId.current = 'sess-2';
        rerender();

        const expectedResponse: ClearChatResponse = {
            mode: 'hard_delete',
            room_id: null,
            affected_count: 3,
            rooms_reset: 0,
        };
        let returnedResult: ClearChatResponse | undefined;
        await act(async () => {
            resolveClear(expectedResponse);
            returnedResult = await clearPromise;
        });

        await waitFor(() => {
            expect(returnedResult).toEqual(expectedResponse);
        });

        // Must NOT mutate messages or bump clearGeneration on the new session
        expect(mockSetMessages).not.toHaveBeenCalled();
        const finalGen = (mockUseChatSync.mock.calls.at(-1)?.[0] as { clearGeneration: number }).clearGeneration;
        expect(finalGen).toBe(initialGen);
    });
});
