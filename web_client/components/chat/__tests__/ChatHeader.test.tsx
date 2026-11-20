import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

        // Check for architect badge text
        expect(screen.getByText(/architetto personale/i)).toBeInTheDocument();

        // Check for minimize button (using icon presence instead of aria-label)
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
    });

    it('should call onMinimize when minimize button clicked', () => {
        render(<ChatHeader {...defaultProps} />);

        // The icon-only button is found by its accessible name, as assistive tech announces it.
        fireEvent.click(screen.getByRole('button', { name: 'Riduci la chat' }));

        expect(defaultProps.onMinimize).toHaveBeenCalledTimes(1);
    });

    it('should display architect badge text', () => {
        render(<ChatHeader {...defaultProps} />);

        // Look for "Architetto personale" badge text
        expect(screen.getByText(/architetto/i)).toBeInTheDocument();
    });

    it('should have header structure with avatar and subtitle', () => {
        const { container } = render(<ChatHeader {...defaultProps} />);

        // Check that header container exists
        const header = container.firstChild;
        expect(header).toBeInTheDocument();

        // Verify architect badge text is present
        expect(screen.getByText(/architetto personale/i)).toBeInTheDocument();

        // Verify SYD name is present
        expect(screen.getByText(/syd/i)).toBeInTheDocument();
    });

    it('does not render overflow menu button when onRequestClear is omitted', () => {
        render(<ChatHeader {...defaultProps} clearActionLabel="Pulisci tutta la chat" />);

        expect(screen.queryByRole('button', { name: 'Altre azioni chat' })).not.toBeInTheDocument();
    });

    it('renders menu trigger with aria attributes and invokes onRequestClear when menuitem is clicked', async () => {
        const user = userEvent.setup();
        const onRequestClear = jest.fn();

        render(
            <ChatHeader
                {...defaultProps}
                clearActionLabel="Ricomincia chat di Bagno"
                onRequestClear={onRequestClear}
            />,
        );

        const trigger = screen.getByRole('button', { name: 'Altre azioni chat' });
        expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        await user.click(trigger);

        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        const menu = screen.getByRole('menu');
        expect(menu).toBeInTheDocument();

        const item = screen.getByRole('menuitem', { name: 'Ricomincia chat di Bagno' });
        expect(item).toBeEnabled();

        await user.click(item);

        expect(onRequestClear).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('disables menu item and does not invoke onRequestClear when canClear is false', async () => {
        const user = userEvent.setup();
        const onRequestClear = jest.fn();

        render(
            <ChatHeader
                {...defaultProps}
                clearActionLabel="Pulisci tutta la chat"
                canClear={false}
                onRequestClear={onRequestClear}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Altre azioni chat' }));
        const item = screen.getByRole('menuitem', { name: 'Pulisci tutta la chat' });
        expect(item).toBeDisabled();

        await user.click(item);
        expect(onRequestClear).not.toHaveBeenCalled();
    });

    it('closes menu on Escape, calls stopPropagation/preventDefault, and returns focus to trigger', async () => {
        const user = userEvent.setup();
        const onRequestClear = jest.fn();
        const windowKeyDown = jest.fn();
        window.addEventListener('keydown', windowKeyDown);

        try {
            render(
                <ChatHeader
                    {...defaultProps}
                    clearActionLabel="Ricomincia chat di Bagno"
                    onRequestClear={onRequestClear}
                />,
            );

            const trigger = screen.getByRole('button', { name: 'Altre azioni chat' });
            await user.click(trigger);

            const menuItem = screen.getByRole('menuitem', { name: 'Ricomincia chat di Bagno' });
            expect(menuItem).toHaveFocus();

            const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            });
            const stopPropagationSpy = jest.spyOn(escapeEvent, 'stopPropagation');
            const preventDefaultSpy = jest.spyOn(escapeEvent, 'preventDefault');

            act(() => {
                menuItem.dispatchEvent(escapeEvent);
            });

            expect(stopPropagationSpy).toHaveBeenCalled();
            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(windowKeyDown).not.toHaveBeenCalled();
            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            expect(trigger).toHaveFocus();
        } finally {
            window.removeEventListener('keydown', windowKeyDown);
        }
    });

    it('stops pointerDown propagation on menu trigger so drag-to-close is not triggered', () => {
        const onPointerDown = jest.fn();

        render(
            <ChatHeader
                {...defaultProps}
                onPointerDown={onPointerDown}
                clearActionLabel="Pulisci tutta la chat"
                onRequestClear={jest.fn()}
            />,
        );

        const trigger = screen.getByRole('button', { name: 'Altre azioni chat' });
        fireEvent.pointerDown(trigger);

        expect(onPointerDown).not.toHaveBeenCalled();
    });

    it('closes the open menu on outside pointerdown', async () => {
        const user = userEvent.setup();

        render(
            <div>
                <div data-testid="outside">Outside</div>
                <ChatHeader
                    {...defaultProps}
                    clearActionLabel="Pulisci tutta la chat"
                    onRequestClear={jest.fn()}
                />
            </div>,
        );

        await user.click(screen.getByRole('button', { name: 'Altre azioni chat' }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        fireEvent.pointerDown(screen.getByTestId('outside'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
