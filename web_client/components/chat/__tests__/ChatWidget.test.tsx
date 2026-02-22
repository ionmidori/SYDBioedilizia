
import React from 'react';
import { render, screen } from '@testing-library/react';
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
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({
        currentProjectId: null,
        isRestoringHistory: false,
        isLoading: false,
        messages: [],
        input: '',
        error: undefined,
        data: [],
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
jest.mock('../ChatHeader', () => ({ ChatHeader: (props: any) => MockChatHeader(props) }));

// Other Mocks
jest.mock('../ChatMessages', () => ({ ChatMessages: () => <div /> }));
jest.mock('../ChatInput', () => ({ ChatInput: () => <div /> }));
jest.mock('../ChatToggleButton', () => ({ ChatToggleButton: () => <button>Toggle</button> }));
jest.mock('@/hooks/useSessionId', () => ({ useSessionId: () => 'fallback' }));
jest.mock('@/hooks/useChatHistory', () => ({ useChatHistory: () => ({ historyLoaded: true, historyMessages: [] }) }));
jest.mock('@/hooks/useMediaUpload', () => ({ useMediaUpload: () => ({ mediaItems: [], isGlobalUploading: false }) }));
jest.mock('@/hooks/useVideoUpload', () => ({ useVideoUpload: () => ({ videos: [], isUploading: false }) }));
jest.mock('@/hooks/useChatScroll', () => ({ useChatScroll: () => ({ messagesContainerRef: { current: null }, messagesEndRef: { current: null }, scrollToBottom: jest.fn() }) }));
jest.mock('@/hooks/useMobileViewport', () => ({ useMobileViewport: () => ({ isMobile: false }) }));
jest.mock('@/hooks/useTypingIndicator', () => ({ useTypingIndicator: () => null }));

describe('ChatWidget', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
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
});
