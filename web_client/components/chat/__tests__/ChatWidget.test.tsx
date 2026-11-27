
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import ChatWidget from '../ChatWidget';
import {
    isChatWindowOpen,
    reopenChatOnNextPage,
    setChatWindowOpen,
    takeReopenChat,
} from '@/lib/chat/chat-window-state';
import '@testing-library/jest-dom';

// Mocks
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/',
    useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}));

const mockUseAuth = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

// ADK stream data exposed by the chat context (status, notice, ...)
const mockChatData: { current: unknown[] } = { current: [] };
const mockSessionId: { current: string | null } = { current: 'chat-session-123' };
const mockUserChatId: { current: string | null } = { current: null };
const mockChatNotice: { current: string | null } = { current: null };
const mockMessages: { current: Array<{ id: string; role: 'user' | 'assistant'; parts?: unknown[] }> } = { current: [] };
const mockHistoryMessages: { current: Array<{ id: string; role: 'user' | 'assistant'; content?: string; roomId?: string | null }> } = { current: [] };
const mockRooms: { current: Array<{ room_id: string; label: string; room_type: 'bagno' | 'cucina' | 'soggiorno' | 'camera' | 'corridoio' | 'altro' }> } = { current: [] };
const mockActiveRoomId: { current: string | null | undefined } = { current: undefined };
const mockIsLoading: { current: boolean } = { current: false };
const mockSetActiveRoomId = jest.fn();
const mockDismissChatNotice = jest.fn();
const mockClearChat = jest.fn();
const mockSendSignal = jest.fn();
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({
        sessionId: mockSessionId.current,
        userChatId: mockUserChatId.current,
        chatNotice: mockChatNotice.current,
        dismissChatNotice: mockDismissChatNotice,
        isRestoringHistory: false,
        isLoading: mockIsLoading.current,
        messages: mockMessages.current,
        historyMessages: mockHistoryMessages.current,
        rooms: mockRooms.current,
        activeRoomId: mockActiveRoomId.current,
        setActiveRoomId: mockSetActiveRoomId,
        clearChat: mockClearChat,
        input: '',
        error: undefined,
        data: mockChatData.current,
        handleInputChange: jest.fn(),
        submitMessage: jest.fn(),
        sendMessage: jest.fn(),
        sendSignal: mockSendSignal,
        reload: jest.fn(),
        stop: jest.fn(),
        setInput: jest.fn(),
        refreshHistory: jest.fn(),
    }),
}));

jest.mock('@/hooks/useStatusQueue', () => ({
    useStatusQueue: () => ({ statusMessage: null, clearQueue: jest.fn(), addToQueue: jest.fn() }),
}));

jest.mock('@ai-sdk/react', () => ({
    useChat: () => ({
        messages: [], input: '', handleInputChange: jest.fn(), handleSubmit: jest.fn(), isLoading: false,
        setMessages: jest.fn(), setInput: jest.fn(), sendMessage: jest.fn(),
    }),
}));

// Exposed Mock for ChatHeader to verify props
const MockChatHeader = jest.fn(() => <div data-testid="chat-header">Header</div>);
jest.mock('../ChatHeader', () => ({ ChatHeader: (props: Record<string, unknown>) => MockChatHeader(props) }));

// Other Mocks
const MockChatMessages = jest.fn<React.ReactElement, [{ messages?: Array<{ id: string }>; activeRoomLabel?: string | null; onImageClick?: (url: string) => void; onCardSignal?: (event: 'card_confirmed' | 'quote_sent') => void }]>(() => <div />);
jest.mock('../ChatMessages', () => ({ ChatMessages: (props: { messages?: Array<{ id: string }>; activeRoomLabel?: string | null; onImageClick?: (url: string) => void; onCardSignal?: (event: 'card_confirmed' | 'quote_sent') => void }) => MockChatMessages(props) }));
const MockChatInput = jest.fn<React.ReactElement, [{ authLoading?: boolean; onSubmit?: (e?: React.FormEvent) => Promise<void> | void }]>(() => <div />);
jest.mock('../ChatInput', () => ({ ChatInput: (props: { authLoading?: boolean; onSubmit?: (e?: React.FormEvent) => Promise<void> | void }) => MockChatInput(props) }));
interface MockChatToggleButtonProps {
    isOpen: boolean;
    onClick: () => void;
    showWelcomeBadge?: boolean;
    controlsId?: string;
    buttonRef?: React.Ref<HTMLButtonElement>;
}
const MockChatToggleButton = jest.fn<React.ReactElement, [MockChatToggleButtonProps]>(
    ({ isOpen, onClick, showWelcomeBadge = true, controlsId, buttonRef }) => (
        <button
            ref={buttonRef}
            onClick={onClick}
            aria-label={isOpen ? 'Chiudi chat' : 'Apri chat'}
            aria-expanded={isOpen}
            aria-controls={controlsId}
            data-welcome-badge={showWelcomeBadge ? 'on' : 'off'}
        >
            Toggle
        </button>
    )
);
jest.mock('../ChatToggleButton', () => ({
    ChatToggleButton: (props: MockChatToggleButtonProps) => MockChatToggleButton(props),
}));
jest.mock('@/hooks/useChatHistory', () => ({ useChatHistory: () => ({ historyLoaded: true, historyMessages: [] }) }));
jest.mock('@/hooks/useChatScroll', () => ({ useChatScroll: () => ({ messagesContainerRef: { current: null }, messagesEndRef: { current: null }, scrollToBottom: jest.fn() }) }));
jest.mock('@/hooks/useMobileViewport', () => ({ useMobileViewport: () => ({ isMobile: false }) }));
jest.mock('@/hooks/useTypingIndicator', () => ({ useTypingIndicator: () => null }));

const mockUseUpload = jest.fn((): Record<string, unknown> => ({
    uploads: {}, addFiles: jest.fn(), removeFile: jest.fn(), retryUpload: jest.fn(),
    clearAll: jest.fn(), isUploading: false, successfulUploads: [],
}));
jest.mock('@/hooks/useUpload', () => ({
    useUpload: (options: { sessionId?: string }) => (mockUseUpload as jest.Mock)(options),
}));

describe('ChatWidget', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        mockChatData.current = [];
        mockSessionId.current = 'chat-session-123';
        mockUserChatId.current = null;
        mockChatNotice.current = null;
        mockMessages.current = [];
        mockHistoryMessages.current = [];
        mockRooms.current = [];
        mockActiveRoomId.current = undefined;
        mockIsLoading.current = false;
        mockClearChat.mockReset().mockResolvedValue({
            mode: 'hard_delete',
            room_id: null,
            affected_count: 1,
            rooms_reset: 0,
        });
        mockUseAuth.mockReturnValue({ isInitialized: true, user: { uid: 'u1' }, refreshToken: jest.fn() });
    });

    test.each(['card_confirmed', 'quote_sent'] as const)(
        'the %s signal of the card restarts the agent with the hidden turn, once per call',
        async (event) => {
            mockSendSignal.mockResolvedValue(undefined);
            render(<ChatWidget variant="inline" />);

            await act(async () => {
                MockChatMessages.mock.calls.at(-1)?.[0].onCardSignal?.(event);
            });

            expect(mockSendSignal).toHaveBeenCalledTimes(1);
            expect(mockSendSignal).toHaveBeenCalledWith(event);
        },
    );

    test('a refused signal is no error banner: the client can go on by writing', async () => {
        mockSendSignal.mockRejectedValue(new Error('boom'));
        render(<ChatWidget variant="inline" />);

        await act(async () => {
            MockChatMessages.mock.calls.at(-1)?.[0].onCardSignal?.('card_confirmed');
        });

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('renders without crashing in inline variant', () => {
        render(<ChatWidget variant="inline" />);

        // ChatHeader should be rendered
        expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    });

    test('offers no way to switch to another chat: one chat per user (Phase 139)', () => {
        render(<ChatWidget variant="inline" />);

        const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(headerProps).not.toHaveProperty('showSelector');
        expect(headerProps).not.toHaveProperty('onProjectSelect');
    });

    test('shows the notice of a turn given back to the user, and lets it be closed', async () => {
        mockChatNotice.current = 'La tua chat è stata aggiornata: allega di nuovo le foto e invia il messaggio.';
        render(<ChatWidget variant="inline" />);

        expect(await screen.findByRole('status')).toHaveTextContent('allega di nuovo le foto');
        await userEvent.click(screen.getByRole('button', { name: 'Chiudi avviso' }));
        expect(mockDismissChatNotice).toHaveBeenCalledTimes(1);
    });

    test('keeps the input disabled until the chat id is known', () => {
        mockSessionId.current = null;
        const view = render(<ChatWidget variant="inline" />);
        expect(MockChatInput.mock.calls.at(-1)?.[0].authLoading).toBe(true);

        mockSessionId.current = 'chat-of-u1';
        view.rerender(<ChatWidget variant="inline" />);
        expect(MockChatInput.mock.calls.at(-1)?.[0].authLoading).toBe(false);
    });

    test('uploads go to the chat session, not a shared guest id', () => {
        mockUseAuth.mockReturnValue({ isInitialized: true, user: null, refreshToken: jest.fn() });
        render(<ChatWidget variant="inline" />);

        // The backend only passes videos under this session's Storage prefix to
        // the model: the upload must use the same sessionId as /api/chat.
        expect(mockUseUpload).toHaveBeenCalledWith({ sessionId: 'chat-session-123' });
        expect(mockUseUpload).not.toHaveBeenCalledWith({ sessionId: 'global-guest' });
    });

    const VIDEO_NOTICE = {
        type: 'notice', level: 'warning', code: 'VIDEO_SKIPPED',
        message: 'Un video allegato non è leggibile ed è stato ignorato.',
    };

    /** The widget is mounted, then the turn streams a notice. */
    function renderThenStreamNotice() {
        const view = render(<ChatWidget variant="inline" />);
        mockChatData.current = [VIDEO_NOTICE];
        view.rerender(<ChatWidget variant="inline" />);
        return view;
    }

    test('tells the user when an attached video could not be read, without an error', async () => {
        renderThenStreamNotice();

        const notice = await screen.findByRole('status');
        expect(notice).toHaveTextContent('Un video allegato non è leggibile ed è stato ignorato.');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('the video notice can be dismissed', async () => {
        renderThenStreamNotice();

        await userEvent.click(await screen.findByRole('button', { name: 'Chiudi avviso' }));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('a notice from before the widget mounted is not replayed', () => {
        mockChatData.current = [VIDEO_NOTICE];
        render(<ChatWidget variant="inline" />);

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    describe('back from a login that left the page (redirect)', () => {
        beforeEach(() => {
            sessionStorage.clear();
            setChatWindowOpen(false);
        });

        test('the chat opens again, once', async () => {
            reopenChatOnNextPage();

            render(<ChatWidget />);

            expect(await screen.findByTestId('chat-window')).toBeInTheDocument();
            expect(isChatWindowOpen()).toBe(true);
            expect(takeReopenChat()).toBe(false);
        });

        test('the chat stays closed when it was closed', () => {
            render(<ChatWidget />);

            expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
            expect(isChatWindowOpen()).toBe(false);
        });

        test('the inline chat, always open, leaves the reopening to the floating one', () => {
            reopenChatOnNextPage();

            render(<ChatWidget variant="inline" />);

            expect(takeReopenChat()).toBe(true);
        });

        test('the chat is no longer reported open once the widget leaves the page', async () => {
            reopenChatOnNextPage();
            const view = render(<ChatWidget />);
            await screen.findByTestId('chat-window');

            view.unmount();

            expect(isChatWindowOpen()).toBe(false);
        });
    });

    test('does not clear failed upload notices when submit is triggered with empty input and no successful uploads', async () => {
        const clearAll = jest.fn();
        mockUseUpload.mockReturnValue({
            uploads: {
                err1: {
                    id: 'err1',
                    file: new File(['x'], 'bad.zip', { type: 'application/zip' }),
                    previewUrl: '',
                    progress: 0,
                    status: 'error',
                    error: 'Formato file non supportato.',
                    retryable: false,
                },
            },
            addFiles: jest.fn(),
            removeFile: jest.fn(),
            retryUpload: jest.fn(),
            clearAll,
            isUploading: false,
            successfulUploads: [],
        });

        render(<ChatWidget variant="inline" />);
        const latestProps = MockChatInput.mock.calls.at(-1)?.[0];
        await latestProps?.onSubmit?.();

        expect(clearAll).not.toHaveBeenCalled();
        expect(mockDismissChatNotice).not.toHaveBeenCalled();
    });

    test('passes showWelcomeBadge={false} and controlsId to ChatToggleButton in floating mode', () => {
        render(<ChatWidget showWelcomeBadge={false} />);

        const toggleProps = MockChatToggleButton.mock.calls.at(-1)?.[0];
        expect(toggleProps?.showWelcomeBadge).toBe(false);
        expect(toggleProps?.controlsId).toBe('syd-chat-window');

        const toggleButton = screen.getByRole('button', { name: 'Apri chat' });
        expect(toggleButton).toHaveAttribute('data-welcome-badge', 'off');
        expect(toggleButton).toHaveAttribute('aria-controls', 'syd-chat-window');
        expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('pressing Escape while floating ChatWidget is open closes chat-window and returns focus to Apri chat button', async () => {
        MotionGlobalConfig.skipAnimations = true;
        const user = userEvent.setup();
        try {
            render(<ChatWidget />);

            const openButton = screen.getByRole('button', { name: 'Apri chat' });
            await user.click(openButton);

            const dialog = await screen.findByRole('dialog', { name: "Chat con l'architetto SYD" });
            expect(dialog).toHaveAttribute('id', 'syd-chat-window');
            expect(screen.getByRole('button', { name: 'Chiudi chat' })).toHaveAttribute('aria-expanded', 'true');

            openButton.blur();
            expect(document.activeElement).not.toBe(openButton);

            await user.keyboard('{Escape}');

            await waitFor(() => {
                expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
                expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Apri chat' }));
            });
        } finally {
            MotionGlobalConfig.skipAnimations = false;
        }
    });

    test('pressing Escape does not close inline ChatWidget', async () => {
        const user = userEvent.setup();
        render(<ChatWidget variant="inline" />);

        expect(screen.getByTestId('chat-window')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    test('pressing Escape does not close floating ChatWidget while ImageLightbox is open', async () => {
        MotionGlobalConfig.skipAnimations = true;
        const user = userEvent.setup();
        try {
            render(<ChatWidget />);

            const toggleButton = screen.getByRole('button', { name: 'Apri chat' });
            await user.click(toggleButton);
            expect(await screen.findByTestId('chat-window')).toBeInTheDocument();

            act(() => {
                MockChatMessages.mock.calls.at(-1)?.[0].onImageClick?.('https://example.com/render.png');
            });
            expect(await screen.findByRole('dialog', { name: 'Anteprima immagine' })).toBeInTheDocument();

            toggleButton.blur();
            await user.keyboard('{Escape}');
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 30));
            });

            expect(screen.getByTestId('chat-window')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Chiudi chat' })).toHaveAttribute('aria-expanded', 'true');
            expect(screen.getByRole('dialog', { name: 'Anteprima immagine' })).toBeInTheDocument();
            expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Chiudi chat' }));
        } finally {
            MotionGlobalConfig.skipAnimations = false;
        }
    });

    test('pressing Escape during IME composition (isComposing) does not close floating ChatWidget', async () => {
        MotionGlobalConfig.skipAnimations = true;
        const user = userEvent.setup();
        try {
            render(<ChatWidget />);

            await user.click(screen.getByRole('button', { name: 'Apri chat' }));
            expect(await screen.findByTestId('chat-window')).toBeInTheDocument();

            await act(async () => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 30));
            });

            expect(screen.getByTestId('chat-window')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Chiudi chat' })).toHaveAttribute('aria-expanded', 'true');
        } finally {
            MotionGlobalConfig.skipAnimations = false;
        }
    });

    test('pressing Escape after defaultPrevented does not close floating ChatWidget', async () => {
        MotionGlobalConfig.skipAnimations = true;
        const user = userEvent.setup();
        try {
            render(<ChatWidget />);

            await user.click(screen.getByRole('button', { name: 'Apri chat' }));
            const chatWindow = await screen.findByTestId('chat-window');

            const preventChildEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') e.preventDefault();
            };
            chatWindow.addEventListener('keydown', preventChildEscape);

            await act(async () => {
                chatWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 30));
            });

            expect(screen.getByTestId('chat-window')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Chiudi chat' })).toHaveAttribute('aria-expanded', 'true');
            chatWindow.removeEventListener('keydown', preventChildEscape);
        } finally {
            MotionGlobalConfig.skipAnimations = false;
        }
    });

    test('filters messages per room when clicking room chips and restores all on Tutte', async () => {
        const user = userEvent.setup();
        mockUserChatId.current = 'proj-1';
        mockRooms.current = [
            { room_id: 'r_bagno', label: 'Bagno', room_type: 'bagno' },
            { room_id: 'r_cucina', label: 'Cucina', room_type: 'cucina' },
        ];
        mockActiveRoomId.current = 'r_bagno';
        mockMessages.current = [
            { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Bagno msg' }] },
            { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'Cucina msg' }] },
            { id: 'm3', role: 'assistant', parts: [{ type: 'text', text: 'Generale' }] },
        ];
        mockHistoryMessages.current = [
            { id: 'm1', role: 'user', content: 'Bagno msg', roomId: 'r_bagno' },
            { id: 'm2', role: 'user', content: 'Cucina msg', roomId: 'r_cucina' },
            { id: 'm3', role: 'assistant', content: 'Generale' },
        ];

        render(<ChatWidget variant="inline" />);

        // Default: Tutte shows all 3 messages
        expect(MockChatMessages.mock.calls.at(-1)?.[0].messages?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

        // Click Bagno: only m1
        await user.click(screen.getByRole('button', { name: /Bagno/i }));
        expect(MockChatMessages.mock.calls.at(-1)?.[0].messages?.map((m) => m.id)).toEqual(['m1']);
        expect(MockChatMessages.mock.calls.at(-1)?.[0].activeRoomLabel).toBe('Bagno');
        expect(mockSetActiveRoomId).toHaveBeenCalledWith('r_bagno');

        // Click Cucina: only m2
        await user.click(screen.getByRole('button', { name: /Cucina/i }));
        expect(MockChatMessages.mock.calls.at(-1)?.[0].messages?.map((m) => m.id)).toEqual(['m2']);
        expect(MockChatMessages.mock.calls.at(-1)?.[0].activeRoomLabel).toBe('Cucina');

        // Click Tutte: all 3 restored
        await user.click(screen.getByRole('button', { name: 'Tutte' }));
        expect(MockChatMessages.mock.calls.at(-1)?.[0].messages?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
        expect(MockChatMessages.mock.calls.at(-1)?.[0].activeRoomLabel).toBeNull();
    });

    describe('clear and restart chat wiring', () => {
        test('passes Pulisci tutta la chat and derives canClear from non-welcome messages and isLoading', () => {
            mockMessages.current = [
                { id: 'welcome-msg', role: 'assistant', parts: [{ type: 'text', text: 'Ciao!' }] },
            ];
            const view = render(<ChatWidget variant="inline" />);

            let headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as Record<string, unknown>;
            expect(headerProps.clearActionLabel).toBe('Pulisci tutta la chat');
            expect(headerProps.canClear).toBe(false);
            expect(typeof headerProps.onRequestClear).toBe('function');

            mockMessages.current = [
                { id: 'welcome-msg', role: 'assistant', parts: [{ type: 'text', text: 'Ciao!' }] },
                { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Ciao SYD' }] },
            ];
            view.rerender(<ChatWidget variant="inline" />);

            headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as Record<string, unknown>;
            expect(headerProps.canClear).toBe(true);

            mockIsLoading.current = true;
            view.rerender(<ChatWidget variant="inline" />);

            headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as Record<string, unknown>;
            expect(headerProps.canClear).toBe(false);
        });

        test('passes clear props in floating mode too', async () => {
            MotionGlobalConfig.skipAnimations = true;
            const user = userEvent.setup();
            try {
                mockMessages.current = [
                    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Ciao SYD' }] },
                ];
                render(<ChatWidget variant="floating" />);

                await user.click(screen.getByRole('button', { name: 'Apri chat' }));
                expect(await screen.findByTestId('chat-window')).toBeInTheDocument();

                const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as Record<string, unknown>;
                expect(headerProps.clearActionLabel).toBe('Pulisci tutta la chat');
                expect(headerProps.canClear).toBe(true);
                expect(typeof headerProps.onRequestClear).toBe('function');
            } finally {
                MotionGlobalConfig.skipAnimations = false;
            }
        });

        test('updates ChatHeader label on room chip selection and confirms room-scoped vs full clear', async () => {
            const user = userEvent.setup();
            mockUserChatId.current = 'proj-1';
            mockRooms.current = [
                { room_id: 'r-bagno', label: 'Bagno', room_type: 'bagno' },
            ];
            mockActiveRoomId.current = 'r-bagno';
            mockMessages.current = [
                { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Bagno msg' }] },
            ];
            mockHistoryMessages.current = [
                { id: 'm1', role: 'user', content: 'Bagno msg', roomId: 'r-bagno' },
            ];

            render(<ChatWidget variant="inline" />);

            // Room Bagno selected
            await user.click(screen.getByRole('button', { name: /Bagno/i }));
            let headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                clearActionLabel?: string;
                onRequestClear?: () => void;
            };
            expect(headerProps.clearActionLabel).toBe('Ricomincia chat di Bagno');

            act(() => {
                headerProps.onRequestClear?.();
            });
            expect(await screen.findByRole('heading', { name: 'Ricominciare la chat di Bagno?' })).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Ricomincia stanza' }));

            await waitFor(() => {
                expect(mockClearChat).toHaveBeenCalledWith('r-bagno');
                expect(screen.getByRole('status')).toHaveTextContent('Chat di Bagno ricominciata.');
            });

            // Switch to Tutte and confirm full clear
            await user.click(screen.getByRole('button', { name: 'Tutte' }));
            headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                clearActionLabel?: string;
                onRequestClear?: () => void;
            };
            expect(headerProps.clearActionLabel).toBe('Pulisci tutta la chat');

            act(() => {
                headerProps.onRequestClear?.();
            });
            expect(await screen.findByRole('heading', { name: 'Pulire tutta la chat?' })).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Pulisci chat' }));

            await waitFor(() => {
                expect(mockClearChat).toHaveBeenCalledWith(null);
                expect(screen.getByRole('status')).toHaveTextContent('Chat pulita.');
            });
        });

        test('pressing Escape while ClearChatDialog is open closes dialog without closing floating ChatWidget', async () => {
            MotionGlobalConfig.skipAnimations = true;
            const user = userEvent.setup();
            try {
                mockMessages.current = [
                    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Ciao SYD' }] },
                ];
                render(<ChatWidget variant="floating" />);

                await user.click(screen.getByRole('button', { name: 'Apri chat' }));
                expect(await screen.findByTestId('chat-window')).toBeInTheDocument();

                const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                    onRequestClear?: () => void;
                };
                act(() => {
                    headerProps.onRequestClear?.();
                });

                expect(await screen.findByRole('heading', { name: 'Pulire tutta la chat?' })).toBeInTheDocument();

                await user.keyboard('{Escape}');

                await waitFor(() => {
                    expect(screen.queryByRole('heading', { name: 'Pulire tutta la chat?' })).not.toBeInTheDocument();
                });
                expect(screen.getByTestId('chat-window')).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'Chiudi chat' })).toHaveAttribute('aria-expanded', 'true');
            } finally {
                MotionGlobalConfig.skipAnimations = false;
            }
        });

        test('displays error in ClearChatDialog without crashing when clearChat rejects', async () => {
            const user = userEvent.setup();
            mockMessages.current = [
                { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Ciao SYD' }] },
            ];
            mockClearChat.mockRejectedValueOnce({
                error_code: 'INTERNAL_ERROR',
                message: 'Impossibile completare la pulizia.',
            });

            render(<ChatWidget variant="inline" />);

            const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                onRequestClear?: () => void;
            };
            act(() => {
                headerProps.onRequestClear?.();
            });

            await user.click(await screen.findByRole('button', { name: 'Pulisci chat' }));

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Impossibile completare la pulizia.',
            );
            expect(screen.getByRole('heading', { name: 'Pulire tutta la chat?' })).toBeInTheDocument();
        });

        test('does not write clearAnnouncement to the new session when sessionId changes while clearChat resolves', async () => {
            const user = userEvent.setup();
            mockMessages.current = [
                { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Ciao SYD' }] },
            ];
            let resolveClear!: (value: { mode: string; room_id: null; affected_count: number; rooms_reset: number }) => void;
            mockClearChat.mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveClear = resolve;
                }),
            );

            const view = render(<ChatWidget variant="inline" />);

            const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                onRequestClear?: () => void;
            };
            act(() => {
                headerProps.onRequestClear?.();
            });

            await user.click(await screen.findByRole('button', { name: 'Pulisci chat' }));

            // Switch session while clearChat is still pending
            mockSessionId.current = 'chat-session-new';
            view.rerender(<ChatWidget variant="inline" />);

            await act(async () => {
                resolveClear({
                    mode: 'hard_delete',
                    room_id: null,
                    affected_count: 1,
                    rooms_reset: 0,
                });
                await Promise.resolve();
            });

            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'Pulire tutta la chat?' })).not.toBeInTheDocument();
        });

        test('does not write clearError to the new session when sessionId changes while clearChat rejects', async () => {
            const user = userEvent.setup();
            mockMessages.current = [
                { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Ciao SYD' }] },
            ];
            let rejectClear!: (reason: unknown) => void;
            mockClearChat.mockReturnValueOnce(
                new Promise((_resolve, reject) => {
                    rejectClear = reject;
                }),
            );

            const view = render(<ChatWidget variant="inline" />);

            const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                onRequestClear?: () => void;
            };
            act(() => {
                headerProps.onRequestClear?.();
            });

            await user.click(await screen.findByRole('button', { name: 'Pulisci chat' }));

            // Switch session while clearChat is still pending
            mockSessionId.current = 'chat-session-new';
            view.rerender(<ChatWidget variant="inline" />);

            await act(async () => {
                rejectClear({
                    error_code: 'INTERNAL_ERROR',
                    message: 'Errore sessione precedente.',
                });
                await Promise.resolve();
            });

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'Pulire tutta la chat?' })).not.toBeInTheDocument();
        });

        test('normalizes whitespace-only room label and clears clearAnnouncement on session switch', async () => {
            const user = userEvent.setup();
            mockUserChatId.current = 'proj-1';
            mockRooms.current = [
                { room_id: 'r-blank', label: '   ', room_type: 'altro' },
            ];
            mockActiveRoomId.current = 'r-blank';
            mockMessages.current = [
                { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Msg' }] },
            ];
            mockHistoryMessages.current = [
                { id: 'm1', role: 'user', content: 'Msg', roomId: 'r-blank' },
            ];

            const view = render(<ChatWidget variant="inline" />);

            const blankRoomButton = screen.getAllByRole('button').find((btn) =>
                btn.getAttribute('aria-pressed') === 'false',
            );
            expect(blankRoomButton).toBeDefined();
            await user.click(blankRoomButton!);

            const headerProps = MockChatHeader.mock.calls.at(-1)?.[0] as {
                clearActionLabel?: string;
                onRequestClear?: () => void;
            };
            expect(headerProps.clearActionLabel).toBe('Pulisci tutta la chat');

            act(() => {
                headerProps.onRequestClear?.();
            });
            await user.click(await screen.findByRole('button', { name: 'Pulisci chat' }));

            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent('Chat pulita.');
            });

            // Switching session must clear the previous announcement
            mockSessionId.current = 'chat-session-after-clear';
            view.rerender(<ChatWidget variant="inline" />);

            expect(screen.queryByRole('status')).not.toBeInTheDocument();
        });
    });
});
