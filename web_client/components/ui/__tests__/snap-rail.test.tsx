import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnapRail } from '@/components/ui/snap-rail';

/** Drives the intersection callback the way a real swipe would. */
function reportIntersection(entries: { index: number; ratio: number }[]) {
    const observers = (global as unknown as { __intersectionObservers: {
        callback: (entries: unknown[]) => void;
        elements: Set<Element>;
    }[] }).__intersectionObservers;

    const observer = observers[observers.length - 1];
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

beforeEach(() => {
    (global as unknown as { __intersectionObservers: unknown[] }).__intersectionObservers = [];
    jest.clearAllMocks();
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

        const tabs = screen.getAllByRole('tab');
        expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('limits the dots to dotCount so a trailing card gets none', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots dotCount={2}>
                <div>Uno</div>
                <div>Due</div>
                <div>Card archivio</div>
            </SnapRail>,
        );

        expect(screen.getAllByRole('tab')).toHaveLength(2);
    });

    it('hides the dots when there is nothing to navigate', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots>
                <div>Uno</div>
            </SnapRail>,
        );

        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('scrolls to the requested item when a dot is pressed', () => {
        render(
            <SnapRail ariaLabel="Rail" showDots align="center">
                <div>Uno</div>
                <div>Due</div>
            </SnapRail>,
        );

        fireEvent.click(screen.getAllByRole('tab')[1]);

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

        fireEvent.click(screen.getAllByRole('tab')[1]);

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
});
