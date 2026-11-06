/** Where the portfolio code runs. A module of its own so tests can stub it. */
export const isBrowser = (): boolean => typeof window !== 'undefined';
