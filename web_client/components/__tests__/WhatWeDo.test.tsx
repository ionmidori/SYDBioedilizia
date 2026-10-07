import { render, screen, within } from '@testing-library/react';
import { WhatWeDo } from '@/components/sections/WhatWeDo';
import { activities } from '@/lib/activities-data';

const cards = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-activity-card]'));

/** The activity rows: direct children of the <ol> (each card also holds a tag list). */
const activityItems = (container: HTMLElement) =>
    Array.from(container.querySelector('ol')?.children ?? []) as HTMLElement[];

describe('WhatWeDo', () => {
    it('renders the section heading as the region label', () => {
        render(<WhatWeDo />);

        const region = screen.getByRole('region', { name: /cosa facciamo/i });
        expect(region).toHaveAttribute('id', 'cosa-facciamo');
    });

    it('lists the six activities in order', () => {
        const { container } = render(<WhatWeDo />);

        const items = activityItems(container);
        expect(items).toHaveLength(6);

        const titles = items.map((item) => within(item).getByRole('heading', { level: 3 }).textContent);
        expect(titles).toEqual(activities.map((a) => a.title));
    });

    it('renders a connector between cards but not after the last one', () => {
        const { container } = render(<WhatWeDo />);

        expect(container.querySelectorAll('[data-activity-connector]')).toHaveLength(activities.length - 1);
        const lastItem = activityItems(container).at(-1);
        expect(lastItem?.querySelector('[data-activity-connector]')).toBeNull();
    });

    it('shows no ordinal numbers on the cards', () => {
        const { container } = render(<WhatWeDo />);

        // The <ol> alone conveys the order; the cards carry icon, title and text.
        // Looks for an element whose whole text is a number like "01" — the text
        // itself may legitimately cite one, e.g. "DM 37/08".
        cards(container).forEach((card) => {
            const ordinals = Array.from(card.querySelectorAll('*')).filter((el) =>
                /^\s*\d{1,2}\s*$/.test(el.textContent ?? ''),
            );
            expect(ordinals).toHaveLength(0);
        });
    });

    it('never truncates a description', () => {
        const { container } = render(<WhatWeDo />);

        // The slot heights are sized to fit the longest text at every width, so no
        // line clamp is needed — and none may come back to cut a description short.
        cards(container).forEach((card) => {
            const description = card.querySelector('p');
            expect(description).not.toBeNull();
            expect(description?.className ?? '').not.toMatch(/line-clamp/);
        });
    });

    it('shows each card as a spec sheet with its discipline header', () => {
        const { container } = render(<WhatWeDo />);

        cards(container).forEach((card, index) => {
            expect(card).toHaveTextContent(`Scheda lavorazione · ${activities[index].discipline}`);
        });
    });

    describe('layout', () => {
        it('shows no photos on the cards', () => {
            const { container } = render(<WhatWeDo />);

            cards(container).forEach((card) => expect(card.querySelector('img')).toBeNull());
        });

        it('sizes cards from their text, never by hand-measured pixel heights or ratios', () => {
            const { container } = render(<WhatWeDo />);

            const fixedSize = /(^|:)(h-\[\d+px\]|aspect-)/;
            container.querySelectorAll('[data-activity-slot], [data-activity-card]').forEach((el) => {
                expect(Array.from(el.classList).filter((c) => fixedSize.test(c))).toEqual([]);
            });
        });
    });

    it('keeps the cards informational — no interactive elements', () => {
        render(<WhatWeDo />);

        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    // The motion itself is CSS (app/scroll-animations.css) and JSDOM runs no scroll
    // timelines, so these pin the hooks that CSS relies on — and that nothing in the
    // markup hides a card when the browser cannot animate it.
    describe('scroll animation hooks', () => {
        it('puts every card inside its own timeline slot', () => {
            const { container } = render(<WhatWeDo />);

            const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-activity-slot]'));
            expect(slots).toHaveLength(activities.length);
            slots.forEach((slot) => expect(slot.querySelector('[data-activity-card]')).not.toBeNull());
        });

        it('alternates the entry side card by card at every width, in a zig-zag', () => {
            const { container } = render(<WhatWeDo />);

            const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-activity-slot]'));
            slots.forEach((slot, index) => {
                // Even cards come from the left (the CSS default), odd ones from the
                // right — on phones too, where the cards are stacked in one column.
                // Only the resting position is lg-only; the direction never is.
                expect(slot.classList.contains('[--sd-dir:1]')).toBe(index % 2 === 1);
                expect(Array.from(slot.classList).some((c) => /^\w+:\[--sd-dir/.test(c))).toBe(false);
            });
        });

        it('gives each connector a line and a dot to animate', () => {
            const { container } = render(<WhatWeDo />);

            container.querySelectorAll('[data-activity-connector]').forEach((connector) => {
                expect(connector.querySelector('[data-connector-line]')).not.toBeNull();
                expect(connector.querySelector('[data-connector-dot]')).not.toBeNull();
            });
        });

        it('renders the cards readable with no script-set hidden state', () => {
            const { container } = render(<WhatWeDo />);

            // Without scroll-timeline support (or under reduced motion) the CSS
            // registers nothing, so the markup alone must show the final state.
            cards(container).forEach((card) => {
                expect(card.style.opacity).toBe('');
                expect(card.style.transform).toBe('');
                expect(card.style.translate).toBe('');
            });
        });
    });
});
