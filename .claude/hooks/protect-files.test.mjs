import assert from 'node:assert/strict';
import test from 'node:test';
import { blockedReason } from './protect-files.mjs';

test('secrets are blocked at any depth and with either separator', () => {
  for (const p of ['.env', 'backend_python/.env', 'C:\\repo\\web_client\\.env.local', '/r/.env.production']) {
    assert.ok(blockedReason(p), p);
  }
});

test('env templates are allowed', () => {
  for (const p of ['.env.example', 'backend_python/.env.example', '.env.sample', '.env.template']) {
    assert.equal(blockedReason(p), null, p);
  }
});

test('lock files are blocked', () => {
  assert.match(blockedReason('backend_python/uv.lock') ?? '', /uv lock/);
  assert.match(blockedReason('package-lock.json') ?? '', /npm install/);
  assert.match(blockedReason('web_client\\package-lock.json') ?? '', /npm install/);
});

test('ordinary files and look-alikes are allowed', () => {
  for (const p of ['src/main.py', 'package.json', 'pyproject.toml', 'docs/env.md', 'src/environment.ts', 'uv.lock.md']) {
    assert.equal(blockedReason(p), null, p);
  }
});
