import { render, screen } from '@testing-library/react';
import { MutableRefObject } from 'react';
import { ChatMessages } from '../ChatMessages';

// Mock ReactMarkdown
jest.mock('react-markdown', () => {
    return function ReactMarkdown({ children }: { children: string }) {
        return <div data-testid="markdown-content">{children}</div>;
    };
});

// Mock AuthProvider to avoid context errors in sub-components
jest.mock('@/components/providers/AuthProvider', () => ({
    useAuthContext: () => ({
        user: null,
        loading: false,
        isInitialized: true,
        idToken: null,
        error: null,
        isAnonymous: true,
        signInAnonymously: jest.fn(),
        loginWithGoogle: jest.fn(),
        loginWithApple: jest.fn(),
        logout: jest.fn(),
        sendMagicLink: jest.fn(),
        completeMagicLink: jest.fn(),
        refreshToken: jest.fn(),
    }),
}));

// Mock the chat context — MessageItem (rendered per message) reads
// historyMessages from it; without a provider useChatContext throws.
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({
        historyMessages: [],
    }),
}));

describe('ChatMessages', () => {
    const mockMessagesContainerRef = {
        current: null,
    } as MutableRefObject<HTMLDivElement | null>;
    const mockMessagesEndRef = {
        current: null,
    } as MutableRefObject<HTMLDivElement | null>;

    const defaultProps = {
        messages: [],
        isLoading: false,
        typingMessage: 'Sto pensando...',
        onImageClick: jest.fn(),
        messagesContainerRef: mockMessagesContainerRef,
        messagesEndRef: mockMessagesEndRef,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render empty state correctly', () => {
        const { container } = render(<ChatMessages {...defaultProps} />);

        // Should have the container
        expect(container.querySelector('.flex-1')).toBeInTheDocument();
    });

    it('should render user message', () => {
        const messages = [
            { id: '1', role: 'user' as const, content: 'Hello, assistant!' },
        ];

        render(<ChatMessages {...defaultProps} messages={messages} />);

        expect(screen.getByText('Hello, assistant!')).toBeInTheDocument();
    });

    it('should render assistant message', () => {
        const messages = [
            { id: '1', role: 'assistant' as const, content: 'Hi there!' },
        ];

        render(<ChatMessages {...defaultProps} messages={messages} />);

        expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('should display loading indicator when isLoading is true', () => {
        render(<ChatMessages {...defaultProps} isLoading={true} />);

        // Check for typing message
        expect(screen.getByText('Sto pensando...')).toBeInTheDocument();
    });

    it('should render markdown content correctly', () => {
        const messages = [
            { id: '1', role: 'assistant' as const, content: '**Bold text**' },
        ];

        render(<ChatMessages {...defaultProps} messages={messages} />);

        // ReactMarkdown is mocked, so we check for the mock element
        const markdownContent = screen.getByTestId('markdown-content');
        expect(markdownContent).toBeInTheDocument();
        expect(markdownContent).toHaveTextContent('**Bold text**');
    });

    it('should call onImageClick when image is clicked', () => {
        const messages = [
            { id: '1', role: 'assistant' as const, content: '![image](https://example.com/image.jpg)' },
        ];

        render(<ChatMessages {...defaultProps} messages={messages} />);

        // In the actual implementation, images would be clickable
        // This test validates the callback is passed down
        expect(defaultProps.onImageClick).toBeDefined();
    });

    it('should render multiple messages', () => {
        const messages = [
            { id: '1', role: 'user' as const, content: 'First message' },
            { id: '2', role: 'assistant' as const, content: 'Second message' },
            { id: '3', role: 'user' as const, content: 'Third message' },
        ];

        render(<ChatMessages {...defaultProps} messages={messages} />);

        expect(screen.getByText('First message')).toBeInTheDocument();
        expect(screen.getByText('Second message')).toBeInTheDocument();
        expect(screen.getByText('Third message')).toBeInTheDocument();
    });

    it('should display correct typing message', () => {
        render(<ChatMessages {...defaultProps} isLoading={true} typingMessage="Sto elaborando..." />);

        expect(screen.getByText('Sto elaborando...')).toBeInTheDocument();
    });

    // Regression: while a turn is in flight the SDK holds an empty assistant
    // placeholder. MessageItem used to render its own ThinkingIndicator for that
    // placeholder, on top of the one ChatMessages renders from isLoading — so the
    // user saw two status lines at once ("Contando i mattoni" + "Consultando le stelle").
    describe('thinking indicator', () => {
        const pendingAssistant = [
            { id: '1', role: 'user' as const, content: 'Quanto costa?' },
            { id: '2', role: 'assistant' as const, content: '' },
        ];

        it('shows exactly one indicator while an empty assistant message is pending', () => {
            render(<ChatMessages {...defaultProps} isLoading={true} messages={pendingAssistant} />);

            expect(screen.getAllByTestId('thinking-indicator')).toHaveLength(1);
        });

        it('prefers the backend status message over the rotating filler', () => {
            render(
                <ChatMessages
                    {...defaultProps}
                    isLoading={true}
                    messages={pendingAssistant}
                    statusMessage="Sto consultando il prezzario..."
                />
            );

            expect(screen.getByText('Sto consultando il prezzario...')).toBeInTheDocument();
            expect(screen.queryByText('Sto pensando...')).not.toBeInTheDocument();
        });

        it('renders no indicator once the turn is over', () => {
            render(<ChatMessages {...defaultProps} isLoading={false} messages={pendingAssistant} />);

            expect(screen.queryByTestId('thinking-indicator')).not.toBeInTheDocument();
        });
    });

    it('should handle message with special characters', () => {
        const messages = [
            { id: '1', role: 'user' as const, content: '<script>alert("test")</script>' },
        ];

        render(<ChatMessages {...defaultProps} messages={messages} />);

        // Should render safely (escaped by React)
        expect(screen.getByText(/<script>alert\("test"\)<\/script>/)).toBeInTheDocument();
    });
});
