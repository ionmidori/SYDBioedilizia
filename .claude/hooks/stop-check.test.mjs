import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { checksFor, parseStatus, spawnable } from './stop-check.mjs';

const ROOT = process.cwd();
const z = (...entries) => `${entries.join('\0')}\0`;

test('parseStatus: modified, untracked and renamed files; deletions are dropped', () => {
  const out = z(' M web_client/a.tsx', '?? backend_python/b.py', 'R  backend_python/new.py', 'backend_python/old.py', ' D web_client/gone.ts', 'D  x.py');
  assert.deepEqual(parseStatus(out), ['web_client/a.tsx', 'backend_python/b.py', 'backend_python/new.py']);
});

test('parseStatus: an empty status gives no files', () => {
  assert.deepEqual(parseStatus(''), []);
});

test('nothing relevant changed -> no check (docs, memory, hooks, config)', () => {
  assert.deepEqual(checksFor(['README.md', 'directives/PROJECT_CONTEXT_SUMMARY.md', '.claude/settings.json', 'web_client/package.json', 'backend_python/uv.lock'], ROOT), []);
});

test('a TypeScript file in web_client -> one tsc check run from web_client', () => {
  const checks = checksFor(['web_client/components/chat/ChatInput.tsx', 'web_client/lib/money.ts'], ROOT);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].kind, 'tsc');
  assert.equal(checks[0].cwd, join(ROOT, 'web_client'));
  assert.deepEqual(checks[0].args, ['--noEmit']);
});

test('Python files in the backend -> one ruff check listing only those files', () => {
  const checks = checksFor(['backend_python/src/core/money.py', 'backend_python/tests/unit/test_money_guard.py', 'scripts/other.py'], ROOT);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].kind, 'ruff');
  assert.deepEqual(checks[0].args.slice(0, 4), ['run', '--project', 'backend_python', 'ruff']);
  assert.deepEqual(checks[0].args.slice(-2), ['backend_python/src/core/money.py', 'backend_python/tests/unit/test_money_guard.py']);
});

test('frontend and backend changes -> both checks', () => {
  const kinds = checksFor(['web_client/a.ts', 'backend_python/b.py'], ROOT).map((c) => c.kind);
  assert.deepEqual(kinds, ['tsc', 'ruff']);
});

test('dependency, build and skill folders are ignored', () => {
  assert.deepEqual(checksFor(['web_client/node_modules/x/index.ts', 'web_client/.next/types/a.ts', 'backend_python/.venv/lib/a.py', '.claude/skills/s/example.ts'], ROOT), []);
});

test('ruff goes through uv; tsc resolves to node + the typescript binary (or null when not installed)', () => {
  assert.equal(spawnable({ kind: 'ruff', args: ['run'] }, ROOT)?.command, 'uv');
  const tsc = spawnable({ kind: 'tsc', args: ['--noEmit'] }, ROOT);
  if (tsc) {
    assert.equal(tsc.command, process.execPath);
    assert.match(tsc.args[0], /typescript[\\/]bin[\\/]tsc$/);
  }
});
