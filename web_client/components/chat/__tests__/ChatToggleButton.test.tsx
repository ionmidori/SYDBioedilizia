import { render, screen, fireEvent } from '@testing-library/react';
import { ChatToggleButton, CLOSED_SHIFT_PX } from '../ChatToggleButton';

describe('ChatToggleButton', () => {
    const defaultProps = {
        isOpen: false,
        onClick: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should show avatar when isOpen is false', () => {
        render(<ChatToggleButton {...defaultProps} />);

        // Avatar image should be visible
        const avatar = screen.getByAltText(/chat/i);
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
        // Component uses w-[158px] h-[158px] when closed, w-14 h-14 when open
        expect(button).toHaveClass('rounded-full');

        // Rerender with isOpen=true
        rerender(<ChatToggleButton {...defaultProps} isOpen={true} />);

        button = screen.getByRole('button');
        expect(button).toHaveClass('rounded-full');
    });

    it('should have aria-label for accessibility', () => {
        render(<ChatToggleButton {...defaultProps} />);

        const button = screen.getByRole('button');
        expect(button).toHaveAttribute('aria-label');
    });
});

describe('ChatToggleButton closed-state position', () => {
    // syd_final_v9.png is 1024×564 with its opaque artwork ending at y=541, and it
    // renders width-constrained and vertically centred in its box. These are the
    // distances from the bottom of the button box to the artwork's lowest pixel.
    const transparentBelow = (width: number, height: number) => {
        const rendered = (width * 564) / 1024;
        return (height - rendered) / 2 + (rendered * 23) / 564;
    };

    it('drops the avatar down to 3px above the bottom edge, like the right edge', () => {
        // Box offset from the edge (bottom-4 / md:bottom-6) plus the transparent band,
        // minus the 3px safety margin.
        expect(CLOSED_SHIFT_PX.mobile.y).toBeCloseTo(16 + transparentBelow(158, 158) - 3, 5);
        expect(CLOSED_SHIFT_PX.desktop.y).toBeCloseTo(24 + transparentBelow(208, 192) - 3, 5);
        // Sanity: a real move of several dozen pixels, never past the edge.
        expect(CLOSED_SHIFT_PX.mobile.y).toBeGreaterThan(40);
        expect(CLOSED_SHIFT_PX.desktop.y).toBeGreaterThan(50);
    });

    it('applies the drop only while closed, so the open X stays inside the screen', () => {
        const { container, rerender } = render(<ChatToggleButton isOpen={false} onClick={jest.fn()} />);

        const root = container.firstElementChild as HTMLElement;
        const wrapper = root.firstElementChild as HTMLElement;
        expect(root.style.getPropertyValue('--syd-closed-drop-mobile')).toBe(`${CLOSED_SHIFT_PX.mobile.y}px`);
        expect(root.style.getPropertyValue('--syd-closed-drop-desktop')).toBe(`${CLOSED_SHIFT_PX.desktop.y}px`);
        expect(wrapper).toHaveClass('translate-y-[var(--syd-closed-drop-mobile)]', 'md:translate-y-[var(--syd-closed-drop-desktop)]');

        rerender(<ChatToggleButton isOpen={true} onClick={jest.fn()} />);
        expect(wrapper).toHaveClass('translate-y-0');
        expect(wrapper).not.toHaveClass('translate-y-[var(--syd-closed-drop-mobile)]');
    });
});
