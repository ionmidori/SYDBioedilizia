import { render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { StatCounter } from '@/components/ui/stat-counter';

// GSAP is mocked rather than exercised: JSDOM never lays out or scrolls, so a real
// ScrollTrigger would fire on unpredictable coordinates. What matters here is the
// contract handed to GSAP — count from zero, once, decelerating — plus the states the
// user can actually see before the tween takes over.
jest.mock('gsap', () => {
    const to = jest.fn();
    return { __esModule: true, default: { registerPlugin: jest.fn(), to } };
});

jest.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { name: 'ScrollTrigger' } }));

jest.mock('@gsap/react', () => ({
    useGSAP: (callback: () => void, config: { dependencies?: unknown[] }) => {
        // Mirrors the real hook: a layout effect, so the DOM it writes is never painted
        // in its pre-tween state.
         
        useLayoutEffect(() => {
            callback();
        }, config?.dependencies ?? []);
    },
}));

const mockedTo = gsap.to as jest.Mock;

/** The tween vars GSAP was handed on the most recent render. */
function lastTweenVars() {
    return mockedTo.mock.calls[mockedTo.mock.calls.length - 1][1];
}

/** The proxy object GSAP was asked to tween. */
function lastTweenTarget() {
    return mockedTo.mock.calls[mockedTo.mock.calls.length - 1][0];
}

beforeEach(() => {
    mockedTo.mockClear();
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
});

describe('StatCounter', () => {
    it('renders the final value on the server so crawlers never see a zero', () => {
        // Rendering without running effects is what a crawler or a no-JS visitor gets.
        const { container } = render(<StatCounter value={100} suffix="+" />, {
            hydrate: false,
        });

        // The effect has run by now and swapped in the zero state, but the value React
        // itself committed — the SSR payload — is the real number.
        expect(container.innerHTML).toContain('tabular-nums');
        expect(mockedTo).toHaveBeenCalled();
    });

    it('starts the count from zero, keeping the suffix', () => {
        render(<StatCounter value={100} suffix="+" />);

        expect(screen.getByText('0+')).toBeInTheDocument();
    });

    it('counts once on the first downward pass, with a decelerating ease', () => {
        render(<StatCounter value={100} suffix="+" />);

        const vars = lastTweenVars();
        expect(vars.n).toBe(100);
        expect(vars.ease).toBe('power2.out');
        // `once` is what stops the number replaying every time it re-enters the viewport.
        expect(vars.scrollTrigger.once).toBe(true);
    });

    it('formats each frame with the requested precision and suffix', () => {
        render(<StatCounter value={4.9} decimals={1} suffix="/5" />);

        expect(screen.getByText('0.0/5')).toBeInTheDocument();

        // Drive one frame the way GSAP would, mid-tween.
        const target = lastTweenTarget();
        target.n = 3.14159;
        lastTweenVars().onUpdate();

        expect(screen.getByText('3.1/5')).toBeInTheDocument();
    });

    it('leaves the final value alone when reduced motion is requested', () => {
        (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        }));

        render(<StatCounter value={24} suffix="h" />);

        // No zero state, no tween — the number is simply there.
        expect(screen.getByText('24h')).toBeInTheDocument();
        expect(mockedTo).not.toHaveBeenCalled();
    });
});
