import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConsentAwareAnalytics } from '../ConsentAwareAnalytics';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookieManager } from '@/lib/cookie-manager';

type BeforeSendFn = (event: { type: string; url: string }) => unknown;

let capturedAnalyticsBeforeSend: BeforeSendFn | undefined;
let capturedSpeedInsightsBeforeSend: BeforeSendFn | undefined;

jest.mock('@/hooks/useCookieConsent');
jest.mock('@vercel/analytics/next', () => ({
    Analytics: ({ beforeSend }: { beforeSend?: BeforeSendFn }) => {
        capturedAnalyticsBeforeSend = beforeSend;
        return <div data-testid="vercel-analytics" />;
    },
}));
jest.mock('@vercel/speed-insights/next', () => ({
    SpeedInsights: ({ beforeSend }: { beforeSend?: BeforeSendFn }) => {
        capturedSpeedInsightsBeforeSend = beforeSend;
        return <div data-testid="vercel-speed-insights" />;
    },
}));

const mockUseCookieConsent = useCookieConsent as jest.MockedFunction<typeof useCookieConsent>;

function consentHookState(
    consent: ReturnType<typeof useCookieConsent>['consent'],
    isInitialized = true
): ReturnType<typeof useCookieConsent> {
    return {
        consent,
        isInitialized,
        updateConsent: jest.fn(),
        acceptAll: jest.fn(),
        declineAll: jest.fn(),
        isAllowed: (category) => category === 'essential' || Boolean(consent?.[category]),
    };
}

describe('ConsentAwareAnalytics', () => {
    beforeEach(() => {
        capturedAnalyticsBeforeSend = undefined;
        capturedSpeedInsightsBeforeSend = undefined;
        CookieManager.remove('syd_cookie_consent');
        delete window.va;
        delete window.si;
    });

    it('mounts nothing before initialization or when consent is null', () => {
        mockUseCookieConsent.mockReturnValue(consentHookState(null, false));
        const { rerender } = render(<ConsentAwareAnalytics />);
        expect(screen.queryByTestId('vercel-analytics')).toBeNull();
        expect(screen.queryByTestId('vercel-speed-insights')).toBeNull();

        mockUseCookieConsent.mockReturnValue(consentHookState(null, true));
        rerender(<ConsentAwareAnalytics />);
        expect(screen.queryByTestId('vercel-analytics')).toBeNull();
        expect(screen.queryByTestId('vercel-speed-insights')).toBeNull();
    });

    it('mounts nothing when analytics consent is denied', () => {
        mockUseCookieConsent.mockReturnValue(
            consentHookState({ essential: true, analytics: false, marketing: false })
        );
        render(<ConsentAwareAnalytics />);
        expect(screen.queryByTestId('vercel-analytics')).toBeNull();
        expect(screen.queryByTestId('vercel-speed-insights')).toBeNull();
    });

    it('mounts Analytics and SpeedInsights when analytics is granted and disables already-loaded scripts on revocation', () => {
        CookieManager.setConsent({ essential: true, analytics: true, marketing: false });
        mockUseCookieConsent.mockReturnValue(
            consentHookState({ essential: true, analytics: true, marketing: false })
        );

        const vaMock = jest.fn();
        const siMock = jest.fn();
        window.va = vaMock;
        window.si = siMock;

        const { rerender } = render(<ConsentAwareAnalytics />);
        expect(screen.getByTestId('vercel-analytics')).toBeInTheDocument();
        expect(screen.getByTestId('vercel-speed-insights')).toBeInTheDocument();

        const sampleEvent = { type: 'pageview', url: '/test' };
        expect(capturedAnalyticsBeforeSend?.(sampleEvent)).toEqual(sampleEvent);
        expect(capturedSpeedInsightsBeforeSend?.({ type: 'vital', url: '/test' })).toEqual({
            type: 'vital',
            url: '/test',
        });

        // Simulate mid-session revocation
        CookieManager.setConsent({ essential: true, analytics: false, marketing: false });
        mockUseCookieConsent.mockReturnValue(
            consentHookState({ essential: true, analytics: false, marketing: false })
        );
        rerender(<ConsentAwareAnalytics />);

        expect(screen.queryByTestId('vercel-analytics')).toBeNull();
        expect(screen.queryByTestId('vercel-speed-insights')).toBeNull();

        // Already-injected scripts must also have their beforeSend overridden to drop events
        const lastVaCall = vaMock.mock.calls.at(-1);
        const lastSiCall = siMock.mock.calls.at(-1);
        expect(lastVaCall?.[0]).toBe('beforeSend');
        expect((lastVaCall?.[1] as BeforeSendFn)(sampleEvent)).toBeNull();
        expect(lastSiCall?.[0]).toBe('beforeSend');
        expect((lastSiCall?.[1] as BeforeSendFn)({ type: 'vital', url: '/test' })).toBeNull();
    });
});
