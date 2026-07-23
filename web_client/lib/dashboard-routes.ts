/**
 * Dashboard route helpers.
 *
 * The dashboard uses `/dashboard/{projectId}` for project workspaces, but a
 * fixed set of segments are reserved system sections. Any new top-level
 * dashboard section MUST be added here, or the sidebar will treat it as a
 * project id and render the project sub-navigation (the PR #222 "Preventivi"
 * regression).
 */
const SYSTEM_ROUTES = new Set([
  'projects',
  'settings',
  'profile',
  'notifications',
  'gallery',
  'quotes',
]);

/**
 * Returns the project id when `pathname` points inside a project workspace
 * (`/dashboard/{projectId}[/...]`), or `null` for system sections and the
 * dashboard root.
 */
export function getProjectIdFromPathname(pathname: string): string | null {
  const segments = pathname.split('/');
  if (segments.length < 3) return null;
  const candidate = segments[2];
  if (!candidate || SYSTEM_ROUTES.has(candidate)) return null;
  return candidate;
}
