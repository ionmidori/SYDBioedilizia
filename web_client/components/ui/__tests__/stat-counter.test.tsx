import { render, screen, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { animate, useInView } from 'framer-motion';
import { StatCounter } from '@/components/ui/stat-counter';

// Motion's `animate` and `useInView` are mocked rather than exercised: JSDOM never
// lays out or scrolls, so a real IntersectionObserver would never report an entry.
// What matters is the contract handed to Motion — count from zero, on every entry,
// decelerating — plus the states the user can actually see before it takes over.
jest.mock('framer-motion', () => ({
    animate: jest.fn(() => ({ stop: jest.fn() })),
    useInView: jest.fn(() => false),
}));

const mockedAnimate = animate as unknown as jest.Mock;
const mockedInView = useInView as jest.Mock;

/** The options Motion was handed on the most recent count. */
function lastCountOptions() {
    return mockedAnimate.mock.calls[mockedAnimate.mock.calls.length - 1][2];
}

function mockReducedMotion(reduce: boolean) {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
}

beforeEach(() => {
    mockedAnimate.mockClear();
    mockedInView.mockReturnValue(false);
    mockReducedMotion(false);
});

describe('StatCounter', () => {
    it('renders the final value in server output, not zero', () => {
        // renderToStaticMarkup never runs effects — this is the actual SSR/no-JS
        // payload, not a client render with effects skipped.
        const html = renderToStaticMarkup(<StatCounter value={100} suffix="+" />);

        // Match the element's exact text content, not a bare substring — "100+" itself
        // ends in "0+", so a naive `not.toContain('0+')` would fail even on correct output.
        expect(html).toContain('>100+<');
        expect(html).not.toContain('>0+<');
    });

    it('starts from zero, keeping the suffix, and waits for the viewport', () => {
        render(<StatCounter value={100} suffix="+" />);

        expect(screen.getByText('0+')).toBeInTheDocument();
        expect(mockedAnimate).not.toHaveBeenCalled();
    });

    it('counts from zero to the value with a decelerating ease once in view', () => {
        mockedInView.mockReturnValue(true);
        render(<StatCounter value={100} suffix="+" />);

        expect(mockedAnimate).toHaveBeenCalledTimes(1);
        const [from, to, options] = mockedAnimate.mock.calls[0];
        expect(from).toBe(0);
        expect(to).toBe(100);
        expect(options.duration).toBe(1.4);
        // power2.out as a cubic-bezier: decelerating, never overshooting.
        expect(options.ease).toEqual([0.5, 1, 0.89, 1]);
    });

    it('replays the count on every entry, not just the first', () => {
        const { rerender } = render(<StatCounter value={100} suffix="+" />);

        mockedInView.mockReturnValue(true);
        rerender(<StatCounter value={100} suffix="+" />);
        mockedInView.mockReturnValue(false);
        rerender(<StatCounter value={100} suffix="+" />);
        mockedInView.mockReturnValue(true);
        rerender(<StatCounter value={100} suffix="+" />);

        // Leaving does not start (or reset) anything; each entry does.
        expect(mockedAnimate).toHaveBeenCalledTimes(2);
    });

    it('formats each frame with the requested precision and suffix', () => {
        mockedInView.mockReturnValue(true);
        render(<StatCounter value={4.9} decimals={1} suffix="/5" />);

        expect(screen.getByText('0.0/5')).toBeInTheDocument();

        // Drive one frame the way Motion would, mid-count.
        act(() => lastCountOptions().onUpdate(3.14159));

        expect(screen.getByText('3.1/5')).toBeInTheDocument();
    });

    it('stops a running count when unmounted', () => {
        const stop = jest.fn();
        mockedAnimate.mockReturnValueOnce({ stop });
        mockedInView.mockReturnValue(true);

        const { unmount } = render(<StatCounter value={100} suffix="+" />);
        unmount();

        expect(stop).toHaveBeenCalled();
    });

    it('leaves the final value alone when reduced motion is requested', () => {
        mockReducedMotion(true);
        mockedInView.mockReturnValue(true);

        render(<StatCounter value={24} suffix="h" />);

        // No zero state, no count — the number is simply there.
        expect(screen.getByText('24h')).toBeInTheDocument();
        expect(mockedAnimate).not.toHaveBeenCalled();
    });
});
