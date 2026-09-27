import { render, screen, within } from '@testing-library/react';
import { WhatWeDo } from '@/components/sections/WhatWeDo';
import { activities } from '@/lib/activities-data';

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
});
