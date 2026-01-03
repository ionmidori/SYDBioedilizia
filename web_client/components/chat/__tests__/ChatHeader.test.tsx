import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from '../ChatHeader';

describe('ChatHeader', () => {
    const defaultProps = {
        onMinimize: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render with all elements', () => {
        render(<ChatHeader {...defaultProps} />);

        // Check for title (component shows "SYD", not "Assistente SYD")
        expect(screen.getByText(/syd/i)).toBeInTheDocument();

        // Check for status
        expect(screen.getByText(/online/i)).toBeInTheDocument();

        // Check for minimize button (using icon presence instead of aria-label)
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
    });

    it('should call onMinimize when minimize button clicked', () => {
        render(<ChatHeader {...defaultProps} />);

        // Get the button (there's only one button in ChatHeader)
        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(defaultProps.onMinimize).toHaveBeenCalledTimes(1);
    });

    it('should display architect badge text', () => {
        render(<ChatHeader {...defaultProps} />);

        // Look for "Architetto personale" badge text
        expect(screen.getByText(/architetto/i)).toBeInTheDocument();
    });

    it('should have header structure with avatar and status', () => {
        const { container } = render(<ChatHeader {...defaultProps} />);

        // Check that header container exists
        const header = container.firstChild;
        expect(header).toBeInTheDocument();
        
        // Verify Online status is present
        expect(screen.getByText(/online/i)).toBeInTheDocument();
        
        // Verify SYD name is present
        expect(screen.getByText(/syd/i)).toBeInTheDocument();
    });
});
