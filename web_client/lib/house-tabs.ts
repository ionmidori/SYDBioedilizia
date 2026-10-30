/**
 * The tabs of the house (Phase 139: the dashboard is the user's one chat).
 *
 * One source for the mobile header (DashboardHeader), the mobile tabs
 * (HouseMobileTabs) and the desktop panel (HousePanel): the open tab is
 * `?view=` on /dashboard, so a link or a reload lands on the same tab.
 */
export const HOUSE_TABS = [
    { id: 'chat', label: 'Chat' },
    { id: 'media', label: 'Media' },
    { id: 'quote', label: 'Preventivo' },
    { id: 'house', label: 'Casa' },
] as const;

export type HouseTab = (typeof HOUSE_TABS)[number]['id'];

/** On desktop the chat sits beside the panel: the panel has the other tabs. */
export const PANEL_TABS = HOUSE_TABS.filter((tab) => tab.id !== 'chat');

export type PanelTab = (typeof PANEL_TABS)[number]['id'];

const TAB_IDS: ReadonlySet<string> = new Set(HOUSE_TABS.map((tab) => tab.id));

/** The tab `?view=` names; the chat for anything else. */
export function houseTabFromView(view: string | null): HouseTab {
    return view !== null && TAB_IDS.has(view) ? (view as HouseTab) : 'chat';
}

/** The desktop panel's tab: the media when `?view=` names the chat (or nothing). */
export function panelTabFromView(view: string | null): PanelTab {
    const tab = houseTabFromView(view);
    return tab === 'chat' ? 'media' : tab;
}

/** The address of a tab of the house. */
export function houseTabHref(tab: HouseTab): string {
    return `/dashboard?view=${tab}`;
}
