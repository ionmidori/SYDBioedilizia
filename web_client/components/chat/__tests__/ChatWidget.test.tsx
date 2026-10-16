
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatWidget from '../ChatWidget';
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

const mockSetProjectId = jest.fn();
// ADK stream data exposed by the chat context (status, notice, ...)
const mockChatData: { current: unknown[] } = { current: [] };
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({
        currentProjectId: null,
        sessionId: 'chat-session-123',
        isRestoringHistory: false,
        isLoading: false,
        messages: [],
        input: '',
        error: undefined,
        data: mockChatData.current,
        setProjectId: mockSetProjectId,
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
jest.mock('../ChatInput', () => ({ ChatInput: () => <div /> }));
jest.mock('../ChatToggleButton', () => ({ ChatToggleButton: () => <button>Toggle</button> }));
jest.mock('@/hooks/useSessionId', () => ({ useSessionId: () => 'fallback' }));
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
        mockUseAuth.mockReturnValue({ isInitialized: true, user: { uid: 'u1' }, refreshToken: jest.fn() });
    });

    test('renders without crashing in inline variant', () => {
        render(<ChatWidget variant="inline" />);

        // ChatHeader should be rendered
        expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    });

    test('passes projectId prop to context via setProjectId', () => {
        render(<ChatWidget variant="inline" projectId="proj-42" />);

        // Component should call setProjectId with the provided projectId
        expect(mockSetProjectId).toHaveBeenCalledWith('proj-42');
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
});
