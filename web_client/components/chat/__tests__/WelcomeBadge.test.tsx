import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WelcomeBadge } from '../WelcomeBadge';

// Mock framer-motion
jest.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
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
        const badge = screen.queryByText(/Ciao/i);
        expect(badge).not.toBeInTheDocument();
    });

    it('should show after delay when isOpen is false', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        // Initially hidden (no typewriter text yet)
        expect(screen.queryByText(/Ciao/i)).not.toBeInTheDocument();

        // Fast-forward past the 2.5s display delay + enough for typewriter to start
        act(() => { jest.advanceTimersByTime(2600); }); // badge appears (2500ms delay)
        act(() => { jest.advanceTimersByTime(100); });  // a few typewriter chars (35ms each)

        await waitFor(() => {
            // Something should appear (partial typewriter text starts with "C")
            expect(screen.getByText(/^C/)).toBeInTheDocument();
        });
    });

    it('should call onOpenChat when badge is clicked', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        act(() => { jest.advanceTimersByTime(2600); }); // badge appears
        act(() => { jest.advanceTimersByTime(100); });  // partial typewriter

        await waitFor(() => {
            const badge = screen.getByText(/^C/).closest('div[class*="backdrop-blur"]');
            if (badge) {
                fireEvent.click(badge);
            }
        });

        expect(defaultProps.onOpenChat).toHaveBeenCalled();
    });

    it('should display typewriter text progressively', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        act(() => { jest.advanceTimersByTime(2600); }); // badge appears
        // Full message: 57 chars × 35ms = 1995ms — advance enough for all chars
        act(() => { jest.advanceTimersByTime(2100); });

        await waitFor(() => {
            expect(screen.getByText('Ciao, sono qui per aiutarti a ristrutturare la tua casa!')).toBeInTheDocument();
        });
    });

    it('should auto-dismiss after typewriter completes + 9s', async () => {
        render(<WelcomeBadge {...defaultProps} />);

        act(() => { jest.advanceTimersByTime(2600); }); // badge appears
        act(() => { jest.advanceTimersByTime(2100); }); // typewriter completes (57 chars × 35ms)
        act(() => { jest.advanceTimersByTime(9100); }); // auto-dismiss timer

        await waitFor(() => {
            expect(screen.queryByText(/Ciao/i)).not.toBeInTheDocument();
        });
    });

    it('should hide when isOpen changes to true', async () => {
        const { rerender } = render(<WelcomeBadge {...defaultProps} />);

        act(() => { jest.advanceTimersByTime(2600); }); // badge appears
        act(() => { jest.advanceTimersByTime(100); });

        // Verify badge is shown
        await waitFor(() => {
            expect(screen.queryByText(/^C/)).toBeInTheDocument();
        });

        // Open chat
        rerender(<WelcomeBadge {...defaultProps} isOpen={true} />);

        await waitFor(() => {
            expect(screen.queryByText(/^C/)).not.toBeInTheDocument();
        });
    });
});
