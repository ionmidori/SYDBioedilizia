import * as React from 'react';

/**
 * Subscribe to a CSS media query. Backed by useSyncExternalStore so the
 * external MediaQueryList is read without a setState-in-effect double render.
 * getServerSnapshot returns false because matchMedia is unavailable during SSR.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (callback: () => void) => {
      const result = matchMedia(query);
      result.addEventListener('change', callback);
      return () => result.removeEventListener('change', callback);
    },
    [query]
  );

  const getSnapshot = React.useCallback(() => matchMedia(query).matches, [query]);
  const getServerSnapshot = () => false;

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
