#!/usr/bin/env node
/**
 * PostToolUse hook: instant feedback after an edit, with static tools only
 * (no model is ever called from here).
 *  - backend_python/**.py  -> ruff check --fix
 *  - web_client/**.ts(x)   -> eslint --fix
 *  - backend_python/src/schemas/*.py -> Golden Sync reminder (matching web_client/types file)
 * Lint failures exit 2 so Claude sees them; a missing tool or a timeout never blocks.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP = /(^|\/)(node_modules|\.venv|\.venv-eval|\.next[^/]*|\.claude\/skills)\//;
const TIMEOUT_MS = 30_000;

/**
 * @param {string} filePath absolute or repo-relative path of the edited file
 * @param {string} root repo root
 * @returns {{ cwd: string, command: string, args: string[] } | null} lint command, if the file has one
 */
export function lintFor(filePath, root) {
  const rel = relative(root, resolve(root, filePath)).replace(/\\/g, '/');
  if (rel.startsWith('..') || SKIP.test(rel)) return null;
  if (rel.startsWith('backend_python/') && rel.endsWith('.py')) {
    return { cwd: root, command: 'uv', args: ['run', '--project', 'backend_python', 'ruff', 'check', '--fix', '--force-exclude', rel] };
  }
  if (rel.startsWith('web_client/') && /\.tsx?$/.test(rel)) {
    return { cwd: join(root, 'web_client'), command: 'eslint', args: ['--fix', rel.slice('web_client/'.length)] };
  }
  return null;
}

/**
 * Turns a lint plan into something spawnable WITHOUT a shell (a shell would re-parse the arguments,
 * and Windows would need `npx.cmd`): eslint runs as `node <eslint bin>`, resolved from web_client.
 * @returns {{ command: string, args: string[] } | null} null when the tool is not installed
 */
export function spawnable(lint, root) {
  if (lint.command !== 'eslint') return { command: lint.command, args: lint.args };
  try {
    // `eslint/bin/eslint.js` is not in the package's "exports": resolve package.json (exported) and go from there.
    const pkg = createRequire(join(root, 'web_client', 'package.json')).resolve('eslint/package.json');
    const bin = join(dirname(pkg), 'bin', 'eslint.js');
    if (!existsSync(bin)) return null;
    return { command: process.execPath, args: [bin, ...lint.args] };
  } catch {
    return null;
  }
}

/** @returns {string | null} the Golden Sync reminder for a Pydantic schema file */
export function goldenSyncReminder(filePath, root) {
  const rel = relative(root, resolve(root, filePath)).replace(/\\/g, '/');
  const m = /^backend_python\/src\/schemas\/([a-z0-9_]+)\.py$/.exec(rel);
  if (!m || m[1] === '__init__') return null;
  const ts = `web_client/types/${m[1].replace(/_/g, '-')}.ts`;
  const target = existsSync(join(root, ts)) ? ts : 'the matching interface/zod schema in web_client/types/';
  return `Golden Sync: ${rel} changed. Keep ${target} in 1:1 parity (field names, optionality, enums).`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string') return;
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  const reminder = goldenSyncReminder(filePath, root);
  const lint = lintFor(filePath, root);
  let failure = '';
  const cmd = lint ? spawnable(lint, root) : null;
  if (lint && cmd) {
    const run = spawnSync(cmd.command, cmd.args, { cwd: lint.cwd, encoding: 'utf8', timeout: TIMEOUT_MS });
    if (!run.error && run.status !== 0 && run.status !== null) {
      failure = `${lint.command} ${lint.args.join(' ')} failed:\n${(run.stdout + run.stderr).trim().split('\n').slice(-30).join('\n')}`;
    }
  }
  if (reminder) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } }));
  }
  if (failure) {
    process.stderr.write(`${failure}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
