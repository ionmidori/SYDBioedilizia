import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefObject } from 'react';
import { ChatInput } from '../ChatInput';

// Mock VoiceRecorder
jest.mock('@/components/chat/VoiceRecorder', () => {
    return function VoiceRecorder({ onVoiceRecorded }: { onVoiceRecorded: (file: File) => void }) {
        return (
            <button
                data-testid="voice-recorder"
                onClick={() => {
                    const mockFile = new File(['audio'], 'test.webm', { type: 'audio/webm' });
                    onVoiceRecorded(mockFile);
                }}
            >
                Record Voice
            </button>
        );
    };
});

describe('ChatInput', () => {
    const mockFileInputRef: RefObject<HTMLInputElement> = {
        current: null,
    };

    const defaultProps = {
        inputValue: '',
        setInputValue: jest.fn(),
        onInputChange: jest.fn(),
        onSubmit: jest.fn(),
        onFileSelect: jest.fn(),
        onVoiceRecorded: jest.fn(),
        onScrollToBottom: jest.fn(),
        isLoading: false,
        selectedImages: [],
        fileInputRef: mockFileInputRef,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render textarea with placeholder', () => {
        render(<ChatInput {...defaultProps} />);

        const textarea = screen.getByPlaceholderText(/scrivi un messaggio/i);
        expect(textarea).toBeInTheDocument();
    });

    it('should display inputValue in textarea', () => {
        render(<ChatInput {...defaultProps} inputValue="Test message" />);

        const textarea = screen.getByDisplayValue('Test message');
        expect(textarea).toBeInTheDocument();
    });

    it('should call onInputChange when typing', async () => {
        const user = userEvent.setup();
        render(<ChatInput {...defaultProps} />);

        const textarea = screen.getByPlaceholderText(/scrivi un messaggio/i);
        await user.type(textarea, 'Hello');

        expect(defaultProps.onInputChange).toHaveBeenCalled();
    });

    it('should call onSubmit on Enter key', () => {
        render(<ChatInput {...defaultProps} inputValue="Test message" />);

        const textarea = screen.getByPlaceholderText(/scrivi un messaggio/i);
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

        expect(defaultProps.onSubmit).toHaveBeenCalled();
    });

    it('should not submit on Shift+Enter', () => {
        render(<ChatInput {...defaultProps} inputValue="Test message" />);

        const textarea = screen.getByPlaceholderText(/scrivi un messaggio/i);
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

        expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('should call onVoiceRecorded from VoiceRecorder', () => {
        render(<ChatInput {...defaultProps} />);

        const voiceRecorder = screen.getByTestId('voice-recorder');
        fireEvent.click(voiceRecorder);

        expect(defaultProps.onVoiceRecorded).toHaveBeenCalledWith(
            expect.any(File)
        );
    });

    it('should disable textarea when isLoading is true', () => {
        render(<ChatInput {...defaultProps} isLoading={true} />);

        const textarea = screen.getByPlaceholderText(/scrivi un messaggio/i);
        expect(textarea).toBeDisabled();
    });

    it('should disable send button when input is empty', () => {
        render(<ChatInput {...defaultProps} inputValue="" />);

        const sendButton = screen.getByRole('button', { name: /invia/i });
        expect(sendButton).toBeDisabled();
    });

    it('should enable send button when input has value', () => {
        render(<ChatInput {...defaultProps} inputValue="Test" />);

        const sendButton = screen.getByRole('button', { name: /invia/i });
        expect(sendButton).not.toBeDisabled();
    });

    it('should call onSubmit when send button clicked', () => {
        render(<ChatInput {...defaultProps} inputValue="Test" />);

        const sendButton = screen.getByRole('button', { name: /invia/i });
        fireEvent.click(sendButton);

        expect(defaultProps.onSubmit).toHaveBeenCalled();
    });

    it('should have file input for attachments', () => {
        const { container } = render(<ChatInput {...defaultProps} />);

        const fileInput = container.querySelector('input[type="file"]');
        expect(fileInput).toBeInTheDocument();
        expect(fileInput).toHaveAttribute('accept', 'image/*');
    });

    it('should trigger file input click when attachment button clicked', () => {
        const mockFileInput = document.createElement('input');
        mockFileInput.type = 'file';
        mockFileInput.click = jest.fn();

        const fileInputRef: RefObject<HTMLInputElement> = {
            current: mockFileInput,
        };

        render(<ChatInput {...defaultProps} fileInputRef={fileInputRef} />);

        const attachButton = screen.getByRole('button', { name: /allega/i });
        fireEvent.click(attachButton);

        expect(mockFileInput.click).toHaveBeenCalled();
    });
});
