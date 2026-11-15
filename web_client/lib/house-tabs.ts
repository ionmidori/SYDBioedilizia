/**
 * The tabs of the house.
 *
 * One source for the mobile header (DashboardHeader) and the desktop tabs
 * (HouseDashboard): the open tab is `?view=` on /dashboard, so a link or a
 * reload lands on the same tab.
 */
export const HOUSE_TABS = [
    { id: 'media', label: 'Media' },
    { id: 'quote', label: 'Preventivo' },
    { id: 'house', label: 'Casa' },
] as const;

export type HouseTab = (typeof HOUSE_TABS)[number]['id'];

const TAB_IDS: ReadonlySet<string> = new Set(HOUSE_TABS.map((tab) => tab.id));

/** The tab `?view=` names; maps 'chat', null, and unknown values to 'media'. */
export function houseTabFromView(view: string | null): HouseTab {
    return view !== null && TAB_IDS.has(view) ? (view as HouseTab) : 'media';
}

/** The address of a tab of the house. */
export function houseTabHref(tab: HouseTab): string {
    return `/dashboard?view=${tab}`;
}
