import { HOUSE_TABS, houseTabFromView, houseTabHref, PANEL_TABS, panelTabFromView } from '../house-tabs';

describe('house tabs (Phase 139: the dashboard is the house)', () => {
    it('has the four tabs of the house, in order', () => {
        expect(HOUSE_TABS.map((t) => t.label)).toEqual(['Chat', 'Media', 'Preventivo', 'Casa']);
    });

    it('puts everything but the chat in the desktop panel (the chat sits beside it)', () => {
        expect(PANEL_TABS.map((t) => t.id)).toEqual(['media', 'quote', 'house']);
    });

    it.each([
        ['media', 'media'],
        ['quote', 'quote'],
        ['house', 'house'],
        ['chat', 'chat'],
        [null, 'chat'],
        ['files', 'chat'],
    ])('reads ?view=%s as the %s tab', (view, tab) => {
        expect(houseTabFromView(view)).toBe(tab);
    });
});

describe('panelTabFromView', () => {
    it.each([[null, 'media'], ['chat', 'media'], ['quote', 'quote']])('?view=%s opens %s in the desktop panel', (view, tab) => {
        expect(panelTabFromView(view)).toBe(tab);
    });
});

describe('houseTabHref', () => {
    it('names the tab in the address of the house', () => {
        expect(houseTabHref('quote')).toBe('/dashboard?view=quote');
        expect(houseTabFromView(new URL(houseTabHref('house'), 'https://x').searchParams.get('view'))).toBe('house');
    });
});
