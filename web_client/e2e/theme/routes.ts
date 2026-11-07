import fs from 'node:fs';
import path from 'node:path';

/**
 * The route templates of the app, read from the file system (`app/**\/page.tsx`)
 * so a page added tomorrow is covered without editing a list.
 * Route groups `(x)` and private folders `_x` are not URL segments.
 */
const APP_DIR = path.resolve(__dirname, '..', '..', 'app');

export function routeTemplates(dir = APP_DIR, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') out.push(prefix || '/');
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === 'api') continue;
    const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`;
    out.push(...routeTemplates(path.join(dir, entry.name), prefix + segment));
  }
  return out.sort();
}

const isDynamic = (segment: string) => /^\[.+\]$/.test(segment);

/** Does `pathname` belong to `template` (dynamic segments match any value)? */
export function matchesTemplate(pathname: string, template: string): boolean {
  const a = pathname.split('/').filter(Boolean);
  const b = template.split('/').filter(Boolean);
  return a.length === b.length && b.every((seg, i) => isDynamic(seg) || seg === a[i]);
}

/** Fill a template's dynamic segments from `params` (`[projectId]` → params.projectId). */
export function fillTemplate(template: string, params: Record<string, string>): string | null {
  let missing = false;
  const filled = template.replace(/\[([^\]]+)\]/g, (_, name: string) => {
    if (!(name in params)) missing = true;
    return params[name] ?? '';
  });
  return missing ? null : filled;
}
