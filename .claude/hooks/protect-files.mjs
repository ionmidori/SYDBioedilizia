#!/usr/bin/env node
/**
 * PreToolUse hook: refuse edits to files that must never be edited by hand.
 *  - secrets: `.env`, `.env.local`, ... (`.env.example` is fine)
 *  - lock files: `uv.lock` (`uv lock`) and `package-lock.json` (`npm install` from the repo root)
 * Exit 2 blocks the tool call and shows the message to Claude.
 */
import { pathToFileURL } from 'node:url';

const ENV_TEMPLATE = /^\.env\.(example|sample|template)$/;
const ENV_FILE = /^\.env(\..+)?$/;

/** @param {string} filePath @returns {string | null} why the edit is refused, or null when it is allowed */
export function blockedReason(filePath) {
  const name = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  if (ENV_FILE.test(name) && !ENV_TEMPLATE.test(name)) {
    return `${name} holds secrets: edit it yourself, never through Claude (use .env.example for documented names).`;
  }
  if (name === 'uv.lock') return 'uv.lock is generated: edit pyproject.toml, then run `uv lock` and commit both.';
  if (name === 'package-lock.json') return 'package-lock.json is generated: run `npm install` from the repo root (npm workspace).';
  return null;
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
    return; // not our payload: never block on a parse problem
  }
  const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (typeof filePath !== 'string') return;
  const reason = blockedReason(filePath);
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/protect-files.mjs: ${reason}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
