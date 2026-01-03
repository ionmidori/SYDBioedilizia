import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WelcomeBadge } from '../WelcomeBadge';

// Mock framer-motion
jest.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
}));

describe('WelcomeBadge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const defaultProps = {
        isOpen: false,
        onOpenChat: jest.fn(),
    };

    it('should not show when isOpen is true', () => {
        render(<WelcomeBadge {...defaultProps} isOpen={true} />);

        // Badge should not be visible when chat is open
        const badge = screen.queryByText(/Ciao! Sono SYD/i);
        expect(badge).not.toBeInTheDocument();
    });

    it('should show after delay when isOpen is false', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Initially hidden
        expect(screen.queryByText(/Ciao! Sono SYD/i)).not.toBeInTheDocument();

        // Fast-forward time past the delay (2 seconds)
        jest.advanceTimersByTime(2000);

        await waitFor(() => {
            expect(screen.getByText(/Ciao! Sono SYD/i)).toBeInTheDocument();
        });
    });

    it('should call onOpenChat when badge is clicked', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Show the badge
        jest.advanceTimersByTime(2000);

        await waitFor(() => {
            const badge = screen.getByText(/Ciao! Sono SYD/i).closest('div');
            if (badge) {
                fireEvent.click(badge);
            }
        });

        expect(defaultProps.onOpenChat).toHaveBeenCalled();
    });

    it('should hide badge when close button is clicked', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Show the badge
        jest.advanceTimersByTime(2000);

        await waitFor(() => {
            const closeButton = screen.getByRole('button', { name: /chiudi/i });
            fireEvent.click(closeButton);
        });

        // Badge should be hidden
        await waitFor(() => {
            expect(screen.queryByText(/Ciao! Sono SYD/i)).not.toBeInTheDocument();
        });
    });

    it('should display typewriter text', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Show the badge
        jest.advanceTimersByTime(2000);

        await waitFor(() => {
            // The full text should eventually be visible
            const text = screen.getByText(/Ciao! Sono SYD/i);
            expect(text).toBeInTheDocument();
        });
    });

    it('should auto-dismiss after timeout', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Show the badge (2s delay)
        jest.advanceTimersByTime(2000);

        await waitFor(() => {
            expect(screen.getByText(/Ciao! Sono SYD/i)).toBeInTheDocument();
        });

        // Auto-dismiss after 8 seconds
        jest.advanceTimersByTime(8000);

        await waitFor(() => {
            expect(screen.queryByText(/Ciao! Sono SYD/i)).not.toBeInTheDocument();
        });
    });

    it('should not show if dismissed manually', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Show the badge
        jest.advanceTimersByTime(2000);

        await waitFor(() => {
            const closeButton = screen.getByRole('button', { name: /chiudi/i });
            fireEvent.click(closeButton);
        });

        // Advance time further - should not reappear
        jest.advanceTimersByTime(10000);

        expect(screen.queryByText(/Ciao! Sono SYD/i)).not.toBeInTheDocument();
    });
});
