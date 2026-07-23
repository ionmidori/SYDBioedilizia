import { getProjectIdFromPathname } from '../dashboard-routes';

describe('getProjectIdFromPathname', () => {
  it.each([
    ['/dashboard/abc123', 'abc123'],
    ['/dashboard/abc123/files', 'abc123'],
    ['/dashboard/abc123/settings', 'abc123'],
  ])('extracts the project id from %s', (pathname, expected) => {
    expect(getProjectIdFromPathname(pathname)).toBe(expected);
  });

  it.each([
    ['/dashboard'],
    ['/dashboard/projects'],
    ['/dashboard/settings'],
    ['/dashboard/profile'],
    ['/dashboard/notifications'],
    ['/dashboard/gallery'],
    // Regression (PR #222): /dashboard/quotes is a system route, NOT a
    // project id — treating it as one made the sidebar show the project
    // sub-items (Cantiere AI / Galleria & File / Parametri Cantiere).
    ['/dashboard/quotes'],
  ])('returns null for system route %s', (pathname) => {
    expect(getProjectIdFromPathname(pathname)).toBeNull();
  });
});
