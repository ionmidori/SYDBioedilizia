import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { CookieConsent } from '../CookieConsent';
import { useCookieConsent } from '@/hooks/useCookieConsent';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('@/hooks/useCookieConsent');

const { usePathname } = jest.requireMock('next/navigation') as { usePathname: jest.Mock };
const mockConsent = useCookieConsent as jest.MockedFunction<typeof useCookieConsent>;

function renderBanner(pathname: string) {
  usePathname.mockReturnValue(pathname);
  mockConsent.mockReturnValue({
    consent: null,
    isInitialized: true,
    acceptAll: jest.fn(),
    declineAll: jest.fn(),
    updateConsent: jest.fn(),
  } as unknown as ReturnType<typeof useCookieConsent>);
  render(<CookieConsent />);
  // the banner appears after a short delay
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

describe('CookieConsent on the admin console', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is not shown on /admin pages (it would cover the dialog buttons)', () => {
    renderBanner('/admin/quotes/abc');
    expect(screen.queryByRole('button', { name: /accetta/i })).not.toBeInTheDocument();
  });

  it('is still shown on public pages', () => {
    renderBanner('/');
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
