import { act, fireEvent, render, screen } from '@testing-library/react';
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

function installRealVisualViewport(initialHeight: number) {
  const target = new EventTarget();
  let currentHeight = initialHeight;
  const vp = {
    width: 390,
    get height() {
      return currentHeight;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  (window as { visualViewport: typeof vp }).visualViewport = vp;
  return {
    setHeight(h: number) {
      currentHeight = h;
      target.dispatchEvent(new Event('resize'));
    },
  };
}

function mockScrollGeometry(scrollRegion: HTMLElement, field: HTMLElement, initialTop: number, panelBottom = 399) {
  scrollRegion.scrollTop = 0;
  scrollRegion.getBoundingClientRect = () =>
    ({
      top: 75,
      bottom: panelBottom,
      height: panelBottom - 75,
      left: 0,
      right: 390,
      width: 390,
      x: 0,
      y: 75,
      toJSON: () => ({}),
    }) as DOMRect;
  field.getBoundingClientRect = () => {
    const top = initialTop - scrollRegion.scrollTop;
    return {
      top,
      bottom: top + 40,
      height: 40,
      left: 24,
      right: 366,
      width: 342,
      x: 24,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

async function openSignupForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Usa Email e Password' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Registrati' }));
  const sheet = screen.getByRole('dialog', { name: 'Benvenuto in SYD' });
  const scrollRegion = sheet.querySelector('.overflow-y-auto') as HTMLDivElement;
  const passwordInput = screen.getByLabelText('Password', { selector: 'input' }) as HTMLInputElement;
  return { sheet, scrollRegion, passwordInput };
}

describe('AuthDialog on phones (bottom drawer)', () => {
  const originalVisualViewport = window.visualViewport;
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    jest.useRealTimers();
    (window as { visualViewport: typeof originalVisualViewport }).visualViewport = originalVisualViewport;
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      configurable: true,
      writable: true,
    });
  });

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

  it('centers the password field strictly inside the inner panel on focus when obscured, without double-scrolling or scrolling the outer drawer', async () => {
    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const { sheet, scrollRegion, passwordInput } = await openSignupForm();
    // Password sits below the shrunk 75..399 panel when focused while keyboard is already up.
    mockScrollGeometry(scrollRegion, passwordInput, 369, 399);

    passwordInput.focus();
    // Triggering an unrelated resize afterwards must remain idempotent because the field is now centered.
    fireEvent(window, new Event('resize'));

    expect(scrollRegion.scrollTop).toBe(152);
    expect(sheet.scrollTop).toBe(0);
  });

  it('re-centers the focused password field on visualViewport resize (resizes-visual browsers) after starting visible', async () => {
    const vv = installRealVisualViewport(800);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true });

    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const { sheet, scrollRegion, passwordInput } = await openSignupForm();

    // Initially comfortably visible inside 75..760 panel.
    let panelBottom = 760;
    scrollRegion.scrollTop = 0;
    scrollRegion.getBoundingClientRect = () =>
      ({ top: 75, bottom: panelBottom, height: panelBottom - 75, left: 0, right: 390, width: 390, x: 0, y: 75, toJSON: () => ({}) }) as DOMRect;
    passwordInput.getBoundingClientRect = () => {
      const top = 369 - scrollRegion.scrollTop;
      return { top, bottom: top + 40, height: 40, left: 24, right: 366, width: 342, x: 24, y: top, toJSON: () => ({}) } as DOMRect;
    };

    passwordInput.focus();
    expect(scrollRegion.scrollTop).toBe(0);

    // Keyboard opens (resizes-visual): visualViewport shrinks to 440, innerHeight stays 800, panel shrinks to 75..399.
    panelBottom = 399;
    act(() => {
      vv.setHeight(440);
    });

    expect(scrollRegion.scrollTop).toBe(152);
    expect(sheet.scrollTop).toBe(0);
  });

  it('leaves scrollTop untouched when the focused field is already within the 24px margin (no jitter while typing)', async () => {
    const vv = installRealVisualViewport(400);
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true, writable: true });

    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const { scrollRegion, passwordInput } = await openSignupForm();
    mockScrollGeometry(scrollRegion, passwordInput, 200, 399);
    scrollRegion.scrollTop = 40; // top becomes 160, bottom 200 — comfortably inside [75+24, 399-24]

    passwordInput.focus();
    act(() => {
      vv.setHeight(390);
    });

    expect(scrollRegion.scrollTop).toBe(40);
  });

  it('clears Vaul’s stale inline height lock after resize when visualViewport matches innerHeight (Android resizes-content)', async () => {
    const vv = installRealVisualViewport(400);
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true, writable: true });

    render(<AuthDialog open onOpenChange={jest.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'Benvenuto in SYD' });

    // Simulate Vaul pinning inline height during resizes-content keyboard cycle, then keyboard closing.
    sheet.style.height = '360px';
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true });
    act(() => {
      vv.setHeight(800);
    });
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    expect(sheet.style.height).toBe('');
  });

  it('runs the 350ms fallback reveal after focus and cleans up listeners and pending timers on close', async () => {
    installRealVisualViewport(800);
    const removeWindowSpy = jest.spyOn(window, 'removeEventListener');
    const removeVvSpy = jest.spyOn(window.visualViewport!, 'removeEventListener');

    const { rerender } = render(<AuthDialog open onOpenChange={jest.fn()} />);
    const { scrollRegion, passwordInput } = await openSignupForm();
    jest.useFakeTimers();

    // Initially visible on focus, then keyboard animation shrinks panel without firing another resize yet.
    let panelBottom = 760;
    scrollRegion.scrollTop = 0;
    scrollRegion.getBoundingClientRect = () =>
      ({ top: 75, bottom: panelBottom, height: panelBottom - 75, left: 0, right: 390, width: 390, x: 0, y: 75, toJSON: () => ({}) }) as DOMRect;
    passwordInput.getBoundingClientRect = () => {
      const top = 369 - scrollRegion.scrollTop;
      return { top, bottom: top + 40, height: 40, left: 24, right: 366, width: 342, x: 24, y: top, toJSON: () => ({}) } as DOMRect;
    };

    passwordInput.focus();
    expect(scrollRegion.scrollTop).toBe(0);

    panelBottom = 399;
    act(() => {
      jest.advanceTimersByTime(350);
    });
    expect(scrollRegion.scrollTop).toBe(152);

    // Trigger another focus timer, then close the dialog before 350ms elapses: timer & listeners must clean up.
    passwordInput.blur();
    passwordInput.focus();
    rerender(<AuthDialog open={false} onOpenChange={jest.fn()} />);

    expect(removeWindowSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeVvSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    // Pending timer must not mutate scrollTop after closing.
    scrollRegion.scrollTop = 10;
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(scrollRegion.scrollTop).toBe(10);

    removeWindowSpy.mockRestore();
    removeVvSpy.mockRestore();
  });
});
