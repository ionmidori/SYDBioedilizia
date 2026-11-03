import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { accessReason, blockedReason, canonicalName } from './protect-files.mjs';

test('Grep and Glob are checked by path and by glob, with the read policy', () => {
  assert.ok(accessReason('Grep', { pattern: 'KEY', path: 'backend_python/.env' }));
  assert.ok(accessReason('Grep', { pattern: 'KEY', glob: '**/.env*' }));
  assert.ok(accessReason('Grep', { pattern: 'KEY', glob: '*.env' }));
  assert.ok(accessReason('Grep', { pattern: 'KEY', glob: '{.env,src/*.ts}' }));
  assert.ok(accessReason('Glob', { pattern: '**/.ENV*' }));
  assert.ok(accessReason('Glob', { pattern: '.env.local', path: 'web_client' }));
  assert.equal(accessReason('Grep', { pattern: 'KEY', path: 'backend_python/uv.lock' }), null);
});

test('ordinary searches and templates are not blocked', () => {
  assert.equal(accessReason('Grep', { pattern: 'env', glob: '*.ts', path: 'web_client' }), null);
  assert.equal(accessReason('Grep', { pattern: '.env' }), null, 'the regex of a content search is not a path');
  assert.equal(accessReason('Glob', { pattern: '**/*.test.tsx' }), null);
  assert.equal(accessReason('Glob', { pattern: '**/.env.example' }), null);
  assert.equal(accessReason('Glob', { pattern: 'docs/env.md' }), null);
});

test('write tools still protect the lock files, read tools do not', () => {
  assert.ok(accessReason('Edit', { file_path: 'backend_python/uv.lock' }));
  assert.ok(accessReason('NotebookEdit', { notebook_path: 'a/.env' }));
  assert.equal(accessReason('Read', { file_path: 'package-lock.json' }), null);
});

test('secrets are blocked at any depth and with either separator', () => {
  for (const p of ['.env', 'backend_python/.env', 'C:\\repo\\web_client\\.env.local', '/r/.env.production', 'cfg/prod.env']) {
    assert.ok(blockedReason(p), p);
  }
});

test('secrets are blocked for a read too, lock files are not', () => {
  assert.ok(blockedReason('backend_python/.env', { write: false }));
  assert.equal(blockedReason('backend_python/uv.lock', { write: false }), null);
  assert.equal(blockedReason('package-lock.json', { write: false }), null);
});

test('case, trailing dots and spaces, and NTFS data streams do not get around the check', () => {
  for (const p of ['.ENV', '.Env.Local', 'web/.ENV.PRODUCTION', '.env.', '.env ', '.env. .', '.env::$DATA', '.env.local:stream', 'x/PROD.ENV']) {
    assert.ok(blockedReason(p), JSON.stringify(p));
  }
  assert.match(blockedReason('UV.LOCK') ?? '', /uv lock/);
  assert.match(blockedReason('Package-Lock.JSON') ?? '', /npm install/);
  assert.match(blockedReason('uv.lock.') ?? '', /uv lock/);
});

test('a symlink with an innocent name is judged by its real file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'protect-'));
  const secret = join(dir, '.env');
  writeFileSync(secret, 'KEY=1\n');
  const link = join(dir, 'notes.txt');
  try {
    symlinkSync(secret, link);
  } catch {
    return; // creating symlinks needs a privilege on some Windows setups: nothing to assert then
  }
  assert.match(blockedReason(link) ?? '', /holds secrets/);
});

test('env templates are allowed, in any case', () => {
  for (const p of ['.env.example', 'backend_python/.env.example', '.env.sample', '.env.template', '.ENV.EXAMPLE']) {
    assert.equal(blockedReason(p), null, p);
  }
});

test('lock files are blocked for edits', () => {
  assert.match(blockedReason('backend_python/uv.lock') ?? '', /uv lock/);
  assert.match(blockedReason('package-lock.json') ?? '', /npm install/);
  assert.match(blockedReason('web_client\\package-lock.json') ?? '', /npm install/);
});

test('ordinary files and look-alikes are allowed', () => {
  for (const p of ['src/main.py', 'package.json', 'pyproject.toml', 'docs/env.md', 'src/environment.ts', 'uv.lock.md', 'src/dotenv.ts', 'README']) {
    assert.equal(blockedReason(p), null, p);
  }
});

test('canonicalName strips what the filesystem ignores', () => {
  assert.equal(canonicalName('C:\\a\\B\\.ENV::$DATA'), '.env');
  assert.equal(canonicalName('x/y/Name. '), 'name');
});
