import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { accessReason, blockedReason, canonicalName } from './protect-files.mjs';

test('Grep and Glob are checked by path, with the read policy', () => {
  assert.ok(accessReason('Grep', { pattern: 'KEY', path: 'backend_python/.env' }));
  assert.ok(accessReason('Glob', { pattern: '*', path: 'web_client/.env.local' }));
  assert.equal(accessReason('Grep', { pattern: 'KEY', path: 'backend_python/uv.lock' }), null);
});

test('a Grep glob outside the allowed shapes is refused, however it is spelled', () => {
  const sneaky = [
    // the spellings that got past earlier versions of the filter
    '**/.env*', '*.env', '{.env,x}', '{.env,src/*.ts}', '.[e]nv', '.e?v', '*nv', '{.e,x}nv', '[.]env', '.en[v]', '@(.env)', '.+(e)nv', '**/.ENV',
    'web_client/.e?v', 'a/b/.[e]nv.local', '.env.f?o', '.env.*', 'x/.env.f?o',
    // lists, escapes, broad globs
    '*.ts,.env', '*.ts,*.env', '{*.ts,.env}', '*.ts .env', '.e\\nv', 'src\\*.ts', '*', '**/*', 'src/**', '**',
    // an extension that could end a secret name, or a stem that could start one
    '*.env.local', '*.{ts,env}', '*.{ts,envrc}', '.e*.ts', '.*.ts', '?env', '.env',
    // an empty stem lets `*` cover `.env`: the extension alone must not name a stage or a config format
    '*.local', '*.production', '*.staging', '*.development', '*.development.local', '*.test', '*.{ts,local}', '*.cfg', '*.ini', '*.conf', '*.properties',
    '*.example', '*.bak', 'x/y/*.local',
  ];
  for (const glob of sneaky) assert.ok(accessReason('Grep', { pattern: 'KEY', glob }), glob);
});

test('ordinary Grep globs, exclusions, literal names and templates are allowed', () => {
  const fine = [
    '*.ts', '*.tsx', '*.{ts,tsx}', '*.py', 'src/**/*.py', '**/*.test.tsx', 'web_client/**/*.{ts,tsx}', 'test_*.py', 'use*.ts',
    '*.spec.ts', '*.d.ts', '*.stories.tsx', '*.config.mjs', '*.{md,mdx}', '*.min.js', 'docs/env.md', 'environment.ts', 'main.py', 'web_client/package.json', '.env.example', 'pyproject.toml',
    '!.env', '!**/.env*', '!*.ts', '*.ts !node_modules',
  ];
  for (const glob of fine) assert.equal(accessReason('Grep', { pattern: 'env', glob, path: 'web_client' }), null, glob);
  assert.equal(accessReason('Grep', { pattern: '.env' }), null, 'the regex of a content search is not a path');
});

test('a literal secret name in a glob is judged like any other path', () => {
  for (const glob of ['.env', 'web_client/.env.local', 'cfg/PROD.ENV', 'x/.envrc', '.ENV.']) assert.ok(accessReason('Grep', { pattern: 'k', glob }), glob);
});

test('Glob only lists names, so its pattern is not refused', () => {
  assert.equal(accessReason('Glob', { pattern: '**/.ENV*' }), null);
  assert.equal(accessReason('Glob', { pattern: '**/*.test.tsx' }), null);
});

test('a refused glob explains what to use instead', () => {
  assert.match(accessReason('Grep', { pattern: 'x', glob: '**/*' }) ?? '', /use `path`/);
});

test('.envrc is a secret too', () => {
  assert.ok(blockedReason('.envrc'));
  assert.ok(blockedReason('web_client/.ENVRC', { write: false }));
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
