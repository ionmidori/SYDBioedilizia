import { render, screen, fireEvent } from '@testing-library/react';
import { ChatToggleButton } from '../ChatToggleButton';

describe('ChatToggleButton', () => {
    const defaultProps = {
        isOpen: false,
        onClick: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should show avatar when isOpen is false', () => {
        const { container } = render(<ChatToggleButton {...defaultProps} />);

        // Avatar image should be visible
        const avatar = screen.getByAltText(/avatar/i);
        expect(avatar).toBeInTheDocument();
    });

    it('should show X icon when isOpen is true', () => {
        render(<ChatToggleButton {...defaultProps} isOpen={true} />);

        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();

        // X icon should be rendered (svg with specific path)
        const svg = button.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('should call onClick when clicked', () => {
        render(<ChatToggleButton {...defaultProps} />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
    });

    it('should apply correct styling based on isOpen', () => {
        const { rerender } = render(<ChatToggleButton {...defaultProps} />);

        let button = screen.getByRole('button');
        expect(button).toHaveClass('fixed', 'bottom-6', 'right-6');

        // Rerender with isOpen=true
        rerender(<ChatToggleButton {...defaultProps} isOpen={true} />);

        button = screen.getByRole('button');
        expect(button).toHaveClass('fixed', 'bottom-6', 'right-6');
    });

    it('should have aria-label for accessibility', () => {
        render(<ChatToggleButton {...defaultProps} />);

        const button = screen.getByRole('button');
        expect(button).toHaveAttribute('aria-label');
    });
});
