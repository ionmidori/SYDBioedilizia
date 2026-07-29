import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnapRail } from '@/components/ui/snap-rail';

type MockObserver = {
    callback: (entries: unknown[]) => void;
    options?: { root?: unknown };
    elements: Set<Element>;
};

function observers() {
    return (global as unknown as { __intersectionObservers: MockObserver[] }).__intersectionObservers;
}

/**
 * SnapRail mounts up to two IntersectionObservers: one rooted on the rail itself
 * (active-item tracking, always present) and one rooted on the viewport (auto-play
 * visibility, only when `autoPlay` is set). They must be told apart by `root`, not by
 * registration order — order flips depending on whether `autoPlay` is on.
 */
function findObserver(hasRoot: boolean): MockObserver {
    const list = observers();
    for (let i = list.length - 1; i >= 0; i--) {
        if (Boolean(list[i].options?.root) === hasRoot) return list[i];
    }
    throw new Error(`No IntersectionObserver with hasRoot=${hasRoot} was registered`);
}

/** Drives the active-item callback the way a real swipe would. */
function reportIntersection(entries: { index: number; ratio: number }[]) {
    const observer = findObserver(true);
    const elements = Array.from(observer.elements);

    act(() => {
        observer.callback(
            entries.map(({ index, ratio }) => ({
                target: elements[index],
                isIntersecting: ratio > 0,
                intersectionRatio: ratio,
            })),
        );
    });
}

/** Drives the auto-play visibility callback — whether the rail is on screen at all. */
function reportRailVisibility(isVisible: boolean) {
    const observer = findObserver(false);
    act(() => {
        observer.callback([{ isIntersecting: isVisible }]);
    });
}

beforeEach(() => {
    (global as unknown as { __intersectionObservers: unknown[] }).__intersectionObservers = [];
    jest.clearAllMocks();
    // `clearAllMocks` clears call history but not a `mockImplementation` a previous
    // test installed — without resetting it here, a reduced-motion override from one
    // test silently leaks into every test that runs after it in this file.
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
});

describe('SnapRail', () => {
    it('exposes the rail as a labelled region', () => {
        render(
            <SnapRail ariaLabel="Progetti in evidenza">
                <div>Uno</div>
            </SnapRail>,
        );

        expect(screen.getByRole('region', { name: 'Progetti in evidenza' })).toBeInTheDocument();
    });

    it('applies the snap alignment matching the align prop', () => {
        const { container, rerender } = render(
            <SnapRail ariaLabel="Rail" align="center">
                <div>Uno</div>
            </SnapRail>,
        );
        expect(container.querySelector('[data-rail-item]')).toHaveClass('snap-center');

        rerender(
            <SnapRail ariaLabel="Rail" align="start">
                <div>Uno</div>
            </SnapRail>,
        );
        expect(container.querySelector('[data-rail-item]')).toHaveClass('snap-start');
    });

    it('reports the most visible item as active, not the last one seen', () => {
        const onActiveChange = jest.fn();
        render(
            <SnapRail ariaLabel="Rail" onActiveChange={onActiveChange}>
                <div>Uno</div>
                <div>Due</div>
                <div>Tre</div>
            </SnapRail>,
        );

        // A fast swipe reports several cards at once; index 2 is the least visible
        // and must not win just by arriving last in the batch.
        reportIntersection([
            { index: 1, ratio: 0.9 },
            { index: 2, ratio: 0.65 },
        ]);

        expect(onActiveChange).toHaveBeenCalledWith(1);
    });

    it('ignores entries that are not intersecting', () => {
        const onActiveChange = jest.fn();
        render(
            <SnapRail ariaLabel="Rail" onActiveChange={onActiveChange}>
                <div>Uno</div>
                <div>Due</div>
            </SnapRail>,
        );

        reportIntersection([{ index: 1, ratio: 0 }]);

        expect(onActiveChange).not.toHaveBeenCalled();
    });

    it('marks the active dot as selected', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots>
                <div>Uno</div>
                <div>Due</div>
            </SnapRail>,
        );

        reportIntersection([{ index: 1, ratio: 0.9 }]);

        const dots = screen.getAllByRole('button', { name: /Vai all'elemento/ });
        expect(dots[0]).toHaveAttribute('aria-pressed', 'false');
        expect(dots[1]).toHaveAttribute('aria-pressed', 'true');
    });

    it('limits the dots to dotCount so a trailing card gets none', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots dotCount={2}>
                <div>Uno</div>
                <div>Due</div>
                <div>Card archivio</div>
            </SnapRail>,
        );

        expect(screen.getAllByRole('button', { name: /Vai all'elemento/ })).toHaveLength(2);
    });

    it('hides the dots when there is nothing to navigate', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots>
                <div>Uno</div>
            </SnapRail>,
        );

        expect(screen.queryByRole('button', { name: /Vai all'elemento/ })).not.toBeInTheDocument();
    });

    it('scrolls to the requested item when a dot is pressed', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots align="center">
                <div>Uno</div>
                <div>Due</div>
            </SnapRail>,
        );

        fireEvent.click(screen.getAllByRole('button', { name: /Vai all'elemento/ })[1]);

        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest',
        });
    });

    it('jumps without animation when reduced motion is requested', () => {
        (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        }));

        render(
            <SnapRail ariaLabel="Rail" showDots>
                <div>Uno</div>
                <div>Due</div>
            </SnapRail>,
        );

        fireEvent.click(screen.getAllByRole('button', { name: /Vai all'elemento/ })[1]);

        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
            expect.objectContaining({ behavior: 'auto' }),
        );
    });

    it('stops touchstart from reaching the dashboard swipe navigator', () => {
        const onParentTouchStart = jest.fn();
        render(
            <div onTouchStart={onParentTouchStart}>
                <SnapRail ariaLabel="Rail">
                    <div>Uno</div>
                </SnapRail>
            </div>,
        );

        fireEvent.touchStart(screen.getByRole('region', { name: 'Rail' }));

        expect(onParentTouchStart).not.toHaveBeenCalled();
    });

    describe('autoPlay', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('does not advance before the rail is visible', () => {
            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        it('advances to the next card after the delay once visible', () => {
            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            reportRailVisibility(true);

            act(() => {
                jest.advanceTimersByTime(999);
            });
            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

            act(() => {
                jest.advanceTimersByTime(1);
            });
            expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
        });

        it('stops for good after a pointerdown, even once visible again', () => {
            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            reportRailVisibility(true);
            fireEvent.pointerDown(screen.getByRole('region', { name: 'Rail' }));

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        it('stops for good after a swipe (touchstart)', () => {
            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            reportRailVisibility(true);
            fireEvent.touchStart(screen.getByRole('region', { name: 'Rail' }));

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        it('stops for good after a dot is pressed', () => {
            render(
                <SnapRail ariaLabel="Rail" showDots autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                    <div>Tre</div>
                </SnapRail>,
            );

            reportRailVisibility(true);
            fireEvent.click(screen.getAllByRole('button', { name: /Vai all'elemento/ })[1]);
            const callsFromTheClick = (Element.prototype.scrollIntoView as jest.Mock).mock.calls.length;

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(callsFromTheClick);
        });

        it('pauses while scrolled out of view and resumes when back on screen', () => {
            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            reportRailVisibility(true);
            reportRailVisibility(false);

            act(() => {
                jest.advanceTimersByTime(5000);
            });
            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

            reportRailVisibility(true);
            act(() => {
                jest.advanceTimersByTime(1000);
            });
            expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
        });

        it('stops on the last card instead of looping back to the first', () => {
            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            // Land on the last card the way a real swipe would, then let auto-play run.
            reportIntersection([{ index: 1, ratio: 0.9 }]);
            reportRailVisibility(true);

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        it('never starts when reduced motion is requested', () => {
            (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
                matches: query.includes('prefers-reduced-motion'),
                media: query,
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
            }));

            render(
                <SnapRail ariaLabel="Rail" autoPlay autoPlayDelayMs={1000}>
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            reportRailVisibility(true);

            act(() => {
                jest.advanceTimersByTime(5000);
            });

            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        it('never mounts the visibility observer when autoPlay is off', () => {
            render(
                <SnapRail ariaLabel="Rail">
                    <div>Uno</div>
                    <div>Due</div>
                </SnapRail>,
            );

            expect(() => findObserver(false)).toThrow();
        });
    });
});
