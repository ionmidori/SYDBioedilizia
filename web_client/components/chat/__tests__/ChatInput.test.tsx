import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefObject } from 'react';
import { ChatInput } from '../ChatInput';


// Mock Lucide React (all icons used by ChatInput)
jest.mock('lucide-react', () => ({
    Send: () => <div data-testid="icon-send" />,
    Paperclip: () => <div data-testid="icon-paperclip" />,
    Loader2: () => <div data-testid="icon-loader" />,
    FileVideo: () => <div data-testid="icon-file-video" />,
    X: () => <div data-testid="icon-x" />,
    Scissors: () => <div data-testid="icon-scissors" />,
    Camera: () => <div data-testid="icon-camera" />,
    Image: () => <div data-testid="icon-image" />,
    Video: () => <div data-testid="icon-video" />,
    FileText: () => <div data-testid="icon-file-text" />,
    Mic: () => <div data-testid="icon-mic" />,
    ChevronUp: () => <div data-testid="icon-chevron-up" />,
    ChevronDown: () => <div data-testid="icon-chevron-down" />,
    Plus: () => <div data-testid="icon-plus" />,
    Sparkles: () => <div data-testid="icon-sparkles" />,
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
    motion: {
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock haptics
jest.mock('@/lib/haptics', () => ({
    triggerHaptic: jest.fn(),
}));

// Mock VideoTrimmer
jest.mock('@/components/chat/VideoTrimmer', () => ({
    VideoTrimmer: () => null,
}));

// Mock useUpload
jest.mock('@/hooks/useUpload', () => ({
    useUpload: () => ({
        uploads: {},
        addFiles: jest.fn(),
        removeFile: jest.fn(),
        retryUpload: jest.fn(),
        clearAll: jest.fn(),
        isUploading: false,
        successfulUploads: [],
        hasActiveUploads: false,
    }),
}));

describe('ChatInput', () => {
    const mockFileInputRef = {
        current: null,
    } as unknown as RefObject<HTMLInputElement>;

    const defaultProps = {
        inputValue: '',
        setInputValue: jest.fn(),
        onSubmit: jest.fn(),
        onFileSelect: jest.fn(),
        onScrollToBottom: jest.fn(),
        isLoading: false,
        uploads: {},
        onRemoveUpload: jest.fn(),
        onRetryUpload: jest.fn(),
        fileInputRef: mockFileInputRef,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render textarea with placeholder', () => {
        render(<ChatInput {...defaultProps} />);

        const textarea = screen.getByPlaceholderText(/descrivi cosa vuoi ristrutturare/i);
        expect(textarea).toBeInTheDocument();
    });

    it('should display inputValue in textarea', () => {
        render(<ChatInput {...defaultProps} inputValue="Test message" />);

        const textarea = screen.getByDisplayValue('Test message');
        expect(textarea).toBeInTheDocument();
    });

    it('should call setInputValue when typing', async () => {
        const user = userEvent.setup();
        render(<ChatInput {...defaultProps} />);

        const textarea = screen.getByPlaceholderText(/descrivi cosa vuoi ristrutturare/i);
        await user.type(textarea, 'H');

        expect(defaultProps.setInputValue).toHaveBeenCalled();
    });

    it('should call onSubmit on Enter key', () => {
        render(<ChatInput {...defaultProps} inputValue="Test message" />);

        const textarea = screen.getByPlaceholderText(/descrivi cosa vuoi ristrutturare/i);
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

        expect(defaultProps.onSubmit).toHaveBeenCalled();
    });

    it('should not submit on Shift+Enter', () => {
        render(<ChatInput {...defaultProps} inputValue="Test message" />);

        const textarea = screen.getByPlaceholderText(/descrivi cosa vuoi ristrutturare/i);
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

        expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });


    it('should disable textarea when isLoading is true', () => {
        render(<ChatInput {...defaultProps} isLoading={true} />);

        const textarea = screen.getByPlaceholderText(/descrivi cosa vuoi ristrutturare/i);
        expect(textarea).toBeDisabled();
    });

    it('should disable send button when input is empty', () => {
        render(<ChatInput {...defaultProps} inputValue="" />);

        const sendButton = screen.getByTestId('icon-send').closest('button');
        expect(sendButton).toBeDisabled();
    });

    it('should enable send button when input has value', () => {
        render(<ChatInput {...defaultProps} inputValue="Test" />);

        const sendButton = screen.getByTestId('icon-send').closest('button');
        expect(sendButton).not.toBeDisabled();
    });

    it('should call onSubmit when send button clicked', () => {
        render(<ChatInput {...defaultProps} inputValue="Test" />);

        const sendButton = screen.getByTestId('icon-send').closest('button')!;
        fireEvent.click(sendButton);

        expect(defaultProps.onSubmit).toHaveBeenCalled();
    });

    it('should have file input for attachments', () => {
        const { container } = render(<ChatInput {...defaultProps} />);

        const fileInput = container.querySelector('input[type="file"]');
        expect(fileInput).toBeInTheDocument();
        expect(fileInput).toHaveAttribute('accept', 'image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,application/pdf');
    });

    it('should open attach dialog when paperclip button clicked', () => {
        render(<ChatInput {...defaultProps} />);

        // Dialog is closed initially
        expect(screen.queryByText(/carica un file/i)).not.toBeInTheDocument();

        // Find the button containing the Paperclip icon and click it
        const attachButton = screen.getByTestId('icon-paperclip').closest('button')!;
        fireEvent.click(attachButton);

        // After clicking, the dialog should open showing "Allega" title
        expect(screen.getByText(/allega/i)).toBeInTheDocument();
    });
});
