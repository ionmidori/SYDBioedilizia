
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({
        sessionId: mockSessionId.current,
        userChatId: null,
        isRestoringHistory: false,
        isLoading: false,
        messages: [],
        input: '',
        error: undefined,
        data: mockChatData.current,
        handleInputChange: jest.fn(),
        submitMessage: jest.fn(),
        sendMessage: jest.fn(),
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
jest.mock('../ChatMessages', () => ({ ChatMessages: () => <div /> }));
const MockChatInput = jest.fn<React.ReactElement, [{ authLoading?: boolean }]>(() => <div />);
jest.mock('../ChatInput', () => ({ ChatInput: (props: { authLoading?: boolean }) => MockChatInput(props) }));
jest.mock('../ChatToggleButton', () => ({ ChatToggleButton: () => <button>Toggle</button> }));
jest.mock('@/hooks/useChatHistory', () => ({ useChatHistory: () => ({ historyLoaded: true, historyMessages: [] }) }));
jest.mock('@/hooks/useChatScroll', () => ({ useChatScroll: () => ({ messagesContainerRef: { current: null }, messagesEndRef: { current: null }, scrollToBottom: jest.fn() }) }));
jest.mock('@/hooks/useMobileViewport', () => ({ useMobileViewport: () => ({ isMobile: false }) }));
jest.mock('@/hooks/useTypingIndicator', () => ({ useTypingIndicator: () => null }));

const mockUseUpload = jest.fn((_options: { sessionId?: string }) => ({
    uploads: [], addFiles: jest.fn(), removeFile: jest.fn(), retryUpload: jest.fn(),
    clearAll: jest.fn(), isUploading: false, successfulUploads: [],
}));
jest.mock('@/hooks/useUpload', () => ({
    useUpload: (options: { sessionId?: string }) => mockUseUpload(options),
}));

describe('ChatWidget', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        mockChatData.current = [];
        mockSessionId.current = 'chat-session-123';
        mockUseAuth.mockReturnValue({ isInitialized: true, user: { uid: 'u1' }, refreshToken: jest.fn() });
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

    describe('back from a login that left the page (redirect, magic link)', () => {
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
});
