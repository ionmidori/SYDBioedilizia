import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { CookieConsent } from '../CookieConsent';
import { useCookieConsent } from '@/hooks/useCookieConsent';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));
jest.mock('@/hooks/useCookieConsent');

const mockConsent = useCookieConsent as jest.MockedFunction<typeof useCookieConsent>;

function openSettings() {
  mockConsent.mockReturnValue({
    consent: null,
    isInitialized: true,
    acceptAll: jest.fn(),
    declineAll: jest.fn(),
    updateConsent: jest.fn(),
  } as unknown as ReturnType<typeof useCookieConsent>);
  render(<CookieConsent />);
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  fireEvent.click(screen.getByRole('button', { name: /personalizza/i }));
}

describe('CookieConsent settings, for keyboard and screen-reader users', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('names the button that closes the settings', () => {
    openSettings();
    expect(screen.getByRole('button', { name: 'Chiudi le impostazioni' })).toBeInTheDocument();
  });

  it('makes each optional category a toggle button that reports its state', () => {
    openSettings();
    const analytics = screen.getByRole('button', { name: /analitici/i });
    expect(analytics).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(analytics);
    expect(analytics).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the essential category as on and not changeable', () => {
    openSettings();
    const essential = screen.getByRole('button', { name: /essenziali/i });
    expect(essential).toHaveAttribute('aria-pressed', 'true');
    expect(essential).toBeDisabled();
  });

  it('draws the check mark only when a category is on (forced colours would reveal a transparent one)', () => {
    openSettings();
    const analytics = screen.getByRole('button', { name: /analitici/i });
    expect(analytics.querySelector('svg')).toBeNull();
    fireEvent.click(analytics);
    expect(analytics.querySelector('svg')).not.toBeNull();
  });
});
