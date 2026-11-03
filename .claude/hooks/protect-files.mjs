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
 * A Grep `glob` is compiled with a real glob matcher (picomatch, the one Jest ships) and refused when it would
 * include any typical secret file name, so `.[e]nv`, `.e?v`, `*nv` or `{.e,x}nv` get no further than `.env`.
 */
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV_TEMPLATE = /^\.env\.(example|sample|template)$/;
const ENV_SECRET = /^(\.env(rc|\..+)?|.+\.env)$/;
// Names a glob must not be able to select (the hook's own ENV_SECRET rule, spelled out).
const SECRET_PROBES = ['.env', '.env.local', '.env.production', '.env.development.local', '.env.test', '.env.staging', 'prod.env', 'secrets.env', '.envrc'];
const GLOB_MAGIC = /[*?[\]{}()!+@]/;

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

function loadPicomatch() {
  try {
    return createRequire(import.meta.url)('picomatch');
  } catch {
    return null;
  }
}

/**
 * Grep `glob`: refused when it would select a secret file. A leading `!` only excludes, so it is fine. Several
 * space-separated globs are checked one by one. Without picomatch (no `npm ci` yet) every glob that uses
 * wildcards is refused: failing closed, with the fix in the message.
 * @returns {string | null}
 */
function grepGlobReason(glob, picomatch = loadPicomatch()) {
  const parts = new Set([glob, ...glob.split(/\s+/)].filter(Boolean));
  for (const part of parts) {
    if (part.startsWith('!')) continue;
    const literal = blockedReason(part, { write: false });
    if (literal) return literal;
    if (!GLOB_MAGIC.test(part)) continue;
    if (!picomatch) return `cannot check the glob ${JSON.stringify(part)} without picomatch: run \`npm ci\` from the repo root.`;
    let matches;
    try {
      matches = picomatch(part, { dot: true, nocase: true, basename: true });
    } catch {
      return `the glob ${JSON.stringify(part)} cannot be parsed, so it cannot be proven safe: use a plainer pattern.`;
    }
    const hit = SECRET_PROBES.find((name) => matches(name));
    if (hit) return `the glob ${JSON.stringify(part)} would include secret files such as ${hit}: do not read them through Claude.`;
  }
  return null;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);

/**
 * Every tool that names files: Read/Edit/Write/NotebookEdit (`file_path`, `notebook_path`), Grep and Glob (`path`),
 * Grep (`glob`). Reads protect secrets only; writes also protect the lock files. Glob's `pattern` is not checked: it
 * only lists names, and reading what it found goes through Read.
 * Not covered: a Grep over a whole directory never names the secret (ripgrep skips git-ignored files, and the `deny`
 * rules in settings.json cover the rest); nor Grep's `type`.
 * @returns {string | null} why the call is refused, or null
 */
export function accessReason(toolName, toolInput = {}, picomatch = undefined) {
  const write = !READ_TOOLS.has(toolName);
  for (const key of ['file_path', 'notebook_path', 'path']) {
    if (typeof toolInput[key] === 'string') {
      const reason = blockedReason(toolInput[key], { write });
      if (reason) return reason;
    }
  }
  return toolName === 'Grep' && typeof toolInput.glob === 'string' ? grepGlobReason(toolInput.glob, picomatch) : null;
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
