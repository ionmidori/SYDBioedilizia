import { HOUSE_TABS, houseTabFromView, houseTabHref } from '../house-tabs';

describe('house tabs (the dashboard is the house)', () => {
    it('has the three tabs of the house, in order', () => {
        expect(HOUSE_TABS.map((t) => t.label)).toEqual(['Media', 'Preventivo', 'Casa']);
        expect(HOUSE_TABS.map((t) => t.id)).toEqual(['media', 'quote', 'house']);
    });

    it.each([
        ['media', 'media'],
        ['quote', 'quote'],
        ['house', 'house'],
        ['chat', 'media'],
        [null, 'media'],
        ['files', 'media'],
        ['unknown', 'media'],
    ])('reads ?view=%s as the %s tab', (view, tab) => {
        expect(houseTabFromView(view)).toBe(tab);
    });
});

describe('houseTabHref', () => {
    it('names the tab in the address of the house', () => {
        expect(houseTabHref('quote')).toBe('/dashboard?view=quote');
        expect(houseTabFromView(new URL(houseTabHref('house'), 'https://x').searchParams.get('view'))).toBe('house');
    });
});
