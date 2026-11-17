import { fireEvent, render, screen } from '@testing-library/react';
import { AuthDialog } from '../AuthDialog';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ loginWithGoogle: jest.fn(), user: null }) }));
// Phone layout: AuthDialog renders a Vaul bottom Drawer instead of a centered Dialog.
jest.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
jest.mock('../PasskeyButton', () => ({ PasskeyButton: () => null }));
jest.mock('@/lib/firebase', () => ({ auth: {} }));
jest.mock('@/lib/auth/guest-claim', () => ({
  signInKeepingGuestChats: (fn: () => Promise<unknown>) => fn(),
  createAccountKeepingGuestChats: (_cred: unknown, fn: () => Promise<unknown>) => fn(),
}));
jest.mock('@/utils/haptics', () => ({ triggerHaptic: jest.fn() }));

describe('AuthDialog on phones (bottom drawer)', () => {
  it('uses overflow-clip so Vaul’s 200% ::after backdrop cannot make the drawer itself scrollable', () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'Benvenuto in SYD' });
    expect(sheet).toHaveClass('overflow-clip');
    expect(sheet).not.toHaveClass('overflow-hidden');
  });

  it('bounds the drawer height with dvh (not inner svh) and flex-scrolls the inner panel so the Android keyboard cannot push inputs off-screen', () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'Benvenuto in SYD' });
    expect(sheet).toHaveClass('max-h-[90dvh]');

    const scrollRegion = sheet.querySelector('.overflow-y-auto');
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion).toHaveClass('flex-1', 'min-h-0', 'overscroll-contain');
    expect(scrollRegion?.className).not.toMatch(/svh/);
  });

  it('scrolls the inner panel (never the outer drawer) when the keyboard shrinks the viewport and covers the focused password field', async () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usa Email e Password' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Registrati' }));

    const sheet = screen.getByRole('dialog', { name: 'Benvenuto in SYD' });
    const scrollRegion = sheet.querySelector('.overflow-y-auto') as HTMLDivElement;
    const passwordInput = screen.getByLabelText('Password', { selector: 'input' }) as HTMLInputElement;

    // Simulate mobile keyboard shrinking the visible drawer panel to 75..399 while password sits at 369..409.
    scrollRegion.scrollTop = 0;
    scrollRegion.getBoundingClientRect = () =>
      ({ top: 75, bottom: 399, height: 324, left: 0, right: 390, width: 390, x: 0, y: 75, toJSON: () => ({}) }) as DOMRect;
    passwordInput.getBoundingClientRect = () =>
      ({ top: 369, bottom: 409, height: 40, left: 24, right: 366, width: 342, x: 24, y: 369, toJSON: () => ({}) }) as DOMRect;

    passwordInput.focus();
    fireEvent(window, new Event('resize'));

    // Centered inside 324px panel: 0 + (369 - 75) - (324 - 40)/2 = 152px
    expect(scrollRegion.scrollTop).toBeGreaterThanOrEqual(140);
    expect(sheet.scrollTop).toBe(0);
  });
});
