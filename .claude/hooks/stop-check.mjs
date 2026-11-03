#!/usr/bin/env node
/**
 * Stop hook: Claude cannot end its turn while the files it touched fail a static check
 * (no model is ever called from here, no test suite is run).
 *  - web_client/**.ts(x) changed      -> tsc --noEmit  (what `npm run type-check` runs)
 *  - backend_python/**.py changed     -> ruff check on those files only
 * "Changed" = the working tree against HEAD (staged, unstaged, untracked), so a clean tree or a
 * docs-only turn exits at once. A failure prints the tail of the output on stderr and exits 2,
 * which sends Claude back to work; Claude Code itself ends the turn after 8 blocks in a row.
 * A missing tool, a timeout or an unreadable git state never blocks.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP = /(^|\/)(node_modules|\.venv|\.venv-eval|\.next[^/]*|\.claude\/(skills|worktrees))\//;
// Per check: two checks in a row must stay under the hook's 120 s limit in settings.json.
const TIMEOUT_MS = 50_000;
const TAIL_LINES = 30;

/**
 * @param {string} porcelainZ output of `git status --porcelain=v1 -z`
 * @returns {string[]} repo-relative paths that still exist (deletions are dropped; for a rename, the new path)
 */
export function parseStatus(porcelainZ) {
  const parts = porcelainZ.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code[0] === 'R' || code[0] === 'C') i += 1; // the next NUL-separated field is the original path
    if (code.includes('D')) continue;
    files.push(path.replace(/\\/g, '/'));
  }
  return files;
}

/**
 * @param {string[]} files repo-relative paths
 * @returns {{ id: string, cwd: string, kind: 'tsc' | 'ruff', args: string[] }[]} the checks that apply to them
 */
export function checksFor(files, root) {
  const relevant = files.filter((f) => !SKIP.test(f));
  const ts = relevant.some((f) => f.startsWith('web_client/') && /\.tsx?$/.test(f));
  const py = relevant.filter((f) => f.startsWith('backend_python/') && f.endsWith('.py'));
  const checks = [];
  if (ts) checks.push({ id: 'type-check', cwd: join(root, 'web_client'), kind: 'tsc', args: ['--noEmit'] });
  if (py.length > 0) {
    checks.push({ id: 'ruff', cwd: root, kind: 'ruff', args: ['run', '--project', 'backend_python', 'ruff', 'check', '--force-exclude', ...py] });
  }
  return checks;
}

/**
 * Turns a check into something spawnable WITHOUT a shell (Windows would need `npx.cmd`): tsc runs as
 * `node <typescript>/bin/tsc`, resolved from web_client; ruff runs through `uv`.
 * @returns {{ command: string, args: string[] } | null} null when the tool is not installed
 */
export function spawnable(check, root) {
  if (check.kind === 'ruff') return { command: 'uv', args: check.args };
  try {
    const pkg = createRequire(join(root, 'web_client', 'package.json')).resolve('typescript/package.json');
    const bin = join(dirname(pkg), 'bin', 'tsc');
    if (!existsSync(bin)) return null;
    return { command: process.execPath, args: [bin, ...check.args] };
  } catch {
    return null;
  }
}

function changedFiles(root) {
  const run = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (run.error || run.status !== 0) return [];
  return parseStatus(run.stdout);
}

async function main() {
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const failures = [];
  for (const check of checksFor(changedFiles(root), root)) {
    const cmd = spawnable(check, root);
    if (!cmd) continue;
    const run = spawnSync(cmd.command, cmd.args, { cwd: check.cwd, encoding: 'utf8', timeout: TIMEOUT_MS });
    if (!run.error && run.status !== 0 && run.status !== null) {
      failures.push(`${check.id} failed:\n${(run.stdout + run.stderr).trim().split('\n').slice(-TAIL_LINES).join('\n')}`);
    }
  }
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n\n')}\n\nFix these before finishing.\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
