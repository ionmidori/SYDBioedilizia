#!/usr/bin/env node
/**
 * PreToolUse hook: protect secrets and generated files.
 *  - secrets (`.env`, `.env.local`, `prod.env`, ...; `.env.example` is fine): never read NOR edited through Claude
 *  - lock files (`uv.lock` -> `uv lock`, `package-lock.json` -> `npm install` from the repo root): never edited by hand,
 *    but readable
 * Exit 2 blocks the tool call and shows the message to Claude.
 *
 * Names are compared the way Windows/macOS resolve them, not as typed: case-insensitive, without an NTFS alternate
 * data stream (`.env::$DATA`), without trailing dots/spaces (`.env.`), and also by real path (symlinks, 8.3 short names).
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV_TEMPLATE = /^\.env\.(example|sample|template)$/;
const ENV_SECRET = /^(\.env(\..+)?|.+\.env)$/;

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
  const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (typeof filePath !== 'string') return;
  const reason = blockedReason(filePath, { write: input?.tool_name !== 'Read' });
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/protect-files.mjs: ${reason}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
