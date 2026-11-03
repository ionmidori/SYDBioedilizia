#!/usr/bin/env node
/**
 * PreToolUse hook: protect secrets and generated files.
 *  - secrets (`.env`, `.env.local`, `prod.env`, `.envrc`, ...; `.env.example` is fine): never read NOR edited through Claude
 *  - lock files (`uv.lock` -> `uv lock`, `package-lock.json` -> `npm install` from the repo root): never edited by hand,
 *    but readable
 * Exit 2 blocks the tool call and shows the message to Claude.
 *
 * Names are compared the way Windows/macOS resolve them, not as typed: case-insensitive, without an NTFS alternate
 * data stream (`.env::$DATA`), without trailing dots/spaces (`.env.`), and also by real path (symlinks, 8.3 short names).
 *
 * A Grep `glob` is an ALLOWLIST, not a denylist (every denylist of secret-looking spellings was bypassed in review:
 * `.[e]nv`, `.e?v`, `dir/.e?v`, comma lists, backslash escapes, `.env.f?o`...). Only these shapes pass, after any
 * directory: `*.ext`, `*.{ext,ext}`, `stem*.ext`, or a literal file name (checked like any other path). Anything
 * else is refused; use the `path` parameter or a plainer glob.
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV_TEMPLATE = /^\.env\.(example|sample|template)$/;
const ENV_SECRET = /^(\.env(rc|\..+)?|.+\.env)$/;

/** Last path segment as the filesystem would resolve it. */
export function canonicalName(filePath) {
  const last = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  return last.replace(/:.*$/, '').replace(/[. ]+$/, '').toLowerCase();
}

/** The typed name plus, when the file exists, the name of its real path (follows symlinks and short names). */
function candidateNames(filePath) {
  const names = [canonicalName(filePath)];
  try {
    names.push(canonicalName(realpathSync.native(resolve(filePath))));
  } catch {
    // the file does not exist (yet): the typed name is all there is
  }
  return names;
}

/**
 * @param {string} filePath
 * @param {{ write?: boolean }} [options] write=false for a read: only secrets are protected
 * @returns {string | null} why the access is refused, or null when it is allowed
 */
export function blockedReason(filePath, { write = true } = {}) {
  for (const name of candidateNames(filePath)) {
    if (ENV_SECRET.test(name) && !ENV_TEMPLATE.test(name)) {
      return `${name} holds secrets: do not read or edit it through Claude (edit it yourself; .env.example documents the names).`;
    }
    if (write && name === 'uv.lock') return 'uv.lock is generated: edit pyproject.toml, then run `uv lock` and commit both.';
    if (write && name === 'package-lock.json') return 'package-lock.json is generated: run `npm install` from the repo root (npm workspace).';
  }
  return null;
}

// Allowed last segments of a Grep glob. The stem has no dot and no wildcard, so the match can never start with `.env`;
// an extension that is `env`/`envrc` (alone or as a dotted component) could end a secret name, so it is refused.
const EXT = '[a-z0-9]+(?:\\.[a-z0-9]+)*';
const EXT_GLOB = new RegExp(`^[a-z0-9_-]*\\*\\.(?:(${EXT})|\\{(${EXT}(?:,${EXT})*)\\})$`, 'i');
const LITERAL_NAME = /^[a-z0-9._-]+$/i;

/**
 * @returns {string | null} why a Grep glob is refused, or null when it has an allowed shape. A leading `!` only
 * excludes files, so it is fine; space-separated globs are checked one by one.
 */
function grepGlobReason(glob) {
  for (const part of new Set(glob.split(/\s+/).filter(Boolean))) {
    if (part.startsWith('!')) continue;
    const refuse = (why) => `the glob ${JSON.stringify(part)} ${why}: use \`path\`, or a glob like *.ts, *.{ts,tsx}, src/**/*.py or a file name.`;
    if (part.includes('\\')) return refuse('contains a backslash (escapes cannot be checked)');
    const last = part.split('/').pop() ?? '';
    if (LITERAL_NAME.test(last)) {
      const reason = blockedReason(last, { write: false });
      if (reason) return reason;
      continue;
    }
    const m = EXT_GLOB.exec(last);
    if (!m) return refuse('is not an allowed shape, so it could select secret files (.env*)');
    const extensions = (m[1] ?? m[2]).split(/[,.]/).map((e) => e.toLowerCase());
    if (extensions.includes('env') || extensions.includes('envrc')) return refuse('could select .env files');
  }
  return null;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);

/**
 * Every tool that names files: Read/Edit/Write/NotebookEdit (`file_path`, `notebook_path`), Grep and Glob (`path`),
 * Grep (`glob`). Reads protect secrets only; writes also protect the lock files. Glob's `pattern` is not checked: it
 * only lists names, and reading what it found goes through Read.
 * Not covered: a Grep over a whole directory with no glob never names the secret (ripgrep skips git-ignored files, and
 * the `deny` rules in settings.json cover the rest); nor Grep's `type`.
 * @returns {string | null} why the call is refused, or null
 */
export function accessReason(toolName, toolInput = {}) {
  const write = !READ_TOOLS.has(toolName);
  for (const key of ['file_path', 'notebook_path', 'path']) {
    if (typeof toolInput[key] === 'string') {
      const reason = blockedReason(toolInput[key], { write });
      if (reason) return reason;
    }
  }
  return toolName === 'Grep' && typeof toolInput.glob === 'string' ? grepGlobReason(toolInput.glob) : null;
}

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => done(data));
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return; // not our payload: never block on a parse problem
  }
  const reason = accessReason(input?.tool_name, input?.tool_input ?? {});
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/protect-files.mjs: ${reason}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
