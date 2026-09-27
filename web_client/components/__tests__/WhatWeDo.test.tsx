import { render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { WhatWeDo } from '@/components/sections/WhatWeDo';
import { activities } from '@/lib/activities-data';

/** Makes `matchMedia` answer as a browser with the given preferences would. */
function mockMedia({ reducedMotion, desktop }: { reducedMotion: boolean; desktop: boolean }) {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
        matches:
            (query.includes('prefers-reduced-motion: no-preference') && !reducedMotion) ||
            (query.includes('prefers-reduced-motion: reduce') && reducedMotion) ||
            (query.includes('min-width: 1024px') && desktop),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
}

const cards = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-activity-card]'));

describe('WhatWeDo', () => {
    it('renders the section heading as the region label', () => {
        render(<WhatWeDo />);

        const region = screen.getByRole('region', { name: /cosa facciamo/i });
        expect(region).toHaveAttribute('id', 'cosa-facciamo');
    });

    it('lists the six activities in order', () => {
        render(<WhatWeDo />);

        const items = within(screen.getByRole('list')).getAllByRole('listitem');
        expect(items).toHaveLength(6);

        const titles = items.map((item) => within(item).getByRole('heading', { level: 3 }).textContent);
        expect(titles).toEqual(activities.map((a) => a.title));
    });

    it('renders a connector between cards but not after the last one', () => {
        const { container } = render(<WhatWeDo />);

        expect(container.querySelectorAll('[data-activity-connector]')).toHaveLength(activities.length - 1);
        const lastItem = screen.getAllByRole('listitem').at(-1);
        expect(lastItem?.querySelector('[data-activity-connector]')).toBeNull();
    });

    it('keeps the cards informational — no interactive elements', () => {
        render(<WhatWeDo />);

        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    describe('scroll animation', () => {
        const defaultMatchMedia = (window.matchMedia as jest.Mock).getMockImplementation();

        afterEach(() => {
            (window.matchMedia as jest.Mock).mockImplementation(defaultMatchMedia);
        });

        it('registers one scrubbed trigger per card and per connector', () => {
            mockMedia({ reducedMotion: false, desktop: true });
            const { unmount } = render(<WhatWeDo />);

            // 6 cards + 5 connectors.
            expect(ScrollTrigger.getAll()).toHaveLength(activities.length * 2 - 1);

            // Everything is reverted on unmount — no triggers leak across pages.
            unmount();
            expect(ScrollTrigger.getAll()).toHaveLength(0);
        });

        // jsdom has no layout, so every trigger is already past its end and the
        // rendered style is the final state — assert on the tween itself instead.
        it('blurs the cards on desktop only', () => {
            mockMedia({ reducedMotion: false, desktop: true });
            const desktop = render(<WhatWeDo />);
            const [desktopTween] = gsap.getTweensOf(cards(desktop.container)[0]);
            expect(desktopTween.vars.filter).toBe('blur(0px)');
            desktop.unmount();

            mockMedia({ reducedMotion: false, desktop: false });
            const mobile = render(<WhatWeDo />);
            const [mobileTween] = gsap.getTweensOf(cards(mobile.container)[0]);
            // Still animated on mobile — only the blur is dropped.
            expect(mobileTween.vars).toMatchObject({ x: 0, opacity: 1 });
            expect(mobileTween.vars.filter).toBeUndefined();
        });

        it('registers nothing under reduced motion', () => {
            mockMedia({ reducedMotion: true, desktop: true });
            const { container } = render(<WhatWeDo />);

            expect(ScrollTrigger.getAll()).toHaveLength(0);
            expect(cards(container).every((card) => gsap.getTweensOf(card).length === 0)).toBe(true);
        });
    });
});
