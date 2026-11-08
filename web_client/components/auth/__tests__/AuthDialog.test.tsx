import { fireEvent, render, screen } from '@testing-library/react';
import { AuthDialog } from '../AuthDialog';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ loginWithGoogle: jest.fn(), user: null }) }));
jest.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true }));
// The sign-in methods have their own tests; here only the dialog's heading matters.
jest.mock('../PasskeyButton', () => ({ PasskeyButton: () => null }));
jest.mock('../EmailAuthForm', () => ({ EmailAuthForm: () => null }));
jest.mock('../MagicLinkForm', () => ({ MagicLinkForm: () => null }));

describe('AuthDialog heading', () => {
  it('shows the brand mark, hidden from assistive tech: the dialog title already names it', () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Benvenuto in SYD' });
    const mark = dialog.querySelector('svg[data-variant="mark"]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  it('sets the welcome line in the display serif, not in a brand-name face', () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const welcome = screen.getAllByText('Benvenuto in SYD').find((el) => !el.classList.contains('sr-only'))!;
    expect(welcome).toHaveClass('font-serif');
  });

  it('exposes the sign-in methods as tabs, announcing the selected one', () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Social', 'Magic Link', 'Email']);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Social');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Social');
  });

  it('moves between tabs with the arrow keys, one tab stop for the whole list', () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const [social, magic, email] = screen.getAllByRole('tab');
    expect([social, magic, email].map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    social.focus();
    fireEvent.keyDown(social, { key: 'ArrowRight' });
    expect(magic).toHaveFocus();
    expect(magic).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(magic, { key: 'End' });
    expect(email).toHaveFocus();
    fireEvent.keyDown(email, { key: 'ArrowRight' });
    expect(social).toHaveFocus();
  });
});
