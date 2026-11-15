/**
 * The tabs of the house.
 *
 * One source for the mobile header (DashboardHeader), the mobile tabs
 * (HouseMobileTabs) and the desktop panel (HousePanel): the open tab is
 * `?view=` on /dashboard, so a link or a reload lands on the same tab.
 */
export const HOUSE_TABS = [
    { id: 'media', label: 'Media' },
    { id: 'quote', label: 'Preventivo' },
    { id: 'house', label: 'Casa' },
] as const;

export type HouseTab = (typeof HOUSE_TABS)[number]['id'];

// Controller Ruling (Task 2): Retain compatibility aliases until Task 3 migrates HouseDashboard.tsx
export const PANEL_TABS = HOUSE_TABS;
export type PanelTab = HouseTab;

const TAB_IDS: ReadonlySet<string> = new Set(HOUSE_TABS.map((tab) => tab.id));

/**
 * The tab `?view=` names; maps 'chat', null, and unknown values to 'media'.
 * Note: Return type includes compatibility `'chat'` union until Task 3 cleans up HouseDashboard.tsx.
 */
export function houseTabFromView(view: string | null): HouseTab | 'chat' {
    return view !== null && TAB_IDS.has(view) ? (view as HouseTab) : 'media';
}

// Compatibility alias for HouseDashboard.tsx during Task 2
export const panelTabFromView = houseTabFromView;

/**
 * The address of a tab of the house.
 * Accepts compatibility `'chat'` until Task 3 wires HouseQuotePanel to openChat().
 */
export function houseTabHref(tab: HouseTab | 'chat'): string {
    return `/dashboard?view=${tab}`;
}
