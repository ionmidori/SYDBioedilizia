import { render, screen, fireEvent } from '@testing-library/react';
import { MessageFeedback } from '../MessageFeedback';
import { triggerHaptic } from '@/lib/haptics';

// Mock Lucide Icons
jest.mock('lucide-react', () => ({
    ThumbsUp: () => <div data-testid="thumbs-up" />,
    ThumbsDown: () => <div data-testid="thumbs-down" />,
}));

// Mock useAuth
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({
        idToken: 'mock-token',
    }),
}));

// Mock haptics
jest.mock('@/lib/haptics', () => ({
    triggerHaptic: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
    })
) as jest.Mock;

describe('MessageFeedback', () => {
    const defaultProps = {
        messageId: 'msg-123',
        sessionId: 'session-456',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render thumbs up and down buttons', () => {
        render(<MessageFeedback {...defaultProps} />);
        
        expect(screen.getByLabelText('Utile')).toBeInTheDocument();
        expect(screen.getByLabelText('Non utile')).toBeInTheDocument();
    });

    it('should call triggerHaptic and fetch on positive feedback', async () => {
        render(<MessageFeedback {...defaultProps} />);
        
        const upButton = screen.getByLabelText('Utile');
        fireEvent.click(upButton);

        expect(triggerHaptic).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"rating":1'),
        }));

        // Should show "Grazie!"
        expect(await screen.findByText(/grazie!/i)).toBeInTheDocument();
    });

    it('should call triggerHaptic and fetch on negative feedback', async () => {
        render(<MessageFeedback {...defaultProps} />);
        
        const downButton = screen.getByLabelText('Non utile');
        fireEvent.click(downButton);

        expect(triggerHaptic).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"rating":-1'),
        }));

        // Should show "Ci miglioreremo"
        expect(await screen.findByText(/ci miglioreremo/i)).toBeInTheDocument();
    });

    it('should toggle rating and skip fetch on reset', async () => {
        render(<MessageFeedback {...defaultProps} />);
        
        const upButton = screen.getByLabelText('Utile');
        
        // First click: sets to 1
        fireEvent.click(upButton);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        
        // Wait for submission to finish (shown by "Grazie!" appearance)
        expect(await screen.findByText(/grazie!/i)).toBeInTheDocument();
        
        // Second click: sets back to 0 (reset)
        fireEvent.click(upButton);
        expect(triggerHaptic).toHaveBeenCalledTimes(2);
        expect(global.fetch).toHaveBeenCalledTimes(1); // No new fetch for reset
    });
});
