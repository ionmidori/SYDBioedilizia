import assert from 'node:assert/strict';
import test from 'node:test';
import { goldenSyncReminder, lintFor, spawnable } from './post-edit.mjs';

const ROOT = process.cwd();

test('python files in the backend are linted with ruff from the repo root', () => {
  const plan = lintFor('backend_python/src/core/money.py', ROOT);
  assert.equal(plan?.command, 'uv');
  assert.deepEqual(plan?.args.slice(0, 4), ['run', '--project', 'backend_python', 'ruff']);
  assert.equal(plan?.args.at(-1), 'backend_python/src/core/money.py');
});

test('ts and tsx in web_client are linted with eslint from web_client', () => {
  const plan = lintFor('web_client/components/chat/ChatInput.tsx', ROOT);
  assert.equal(plan?.command, 'eslint');
  assert.equal(plan?.args.at(-1), 'components/chat/ChatInput.tsx');
  assert.ok(plan?.cwd.replace(/\\/g, '/').endsWith('/web_client'));
});

test('eslint is spawned as node + its bin (no shell, no npx.cmd); other tools pass through', () => {
  const eslint = spawnable({ cwd: ROOT, command: 'eslint', args: ['--fix', 'a.ts'] }, ROOT);
  assert.equal(eslint?.command, process.execPath);
  assert.match(eslint?.args[0] ?? '', /eslint[\\/]bin[\\/]eslint\.js$/);
  assert.deepEqual(eslint?.args.slice(1), ['--fix', 'a.ts']);
  assert.deepEqual(spawnable({ cwd: ROOT, command: 'uv', args: ['run'] }, ROOT), { command: 'uv', args: ['run'] });
  assert.equal(spawnable({ cwd: '/x', command: 'eslint', args: [] }, '/definitely/not/a/repo'), null);
});

test('generated, vendored, local-only and unrelated files are not linted', () => {
  for (const p of ['web_client/node_modules/x/index.ts', 'backend_python/.venv/lib/a.py', '.claude/skills/x/SKILL.md', 'README.md', 'web_client/package.json', 'scripts/preflight.mjs']) {
    assert.equal(lintFor(p, ROOT), null, p);
  }
});

test('a schema change reminds the matching TypeScript file', () => {
  assert.match(goldenSyncReminder('backend_python/src/schemas/user_chat.py', ROOT) ?? '', /Golden Sync/);
  assert.equal(goldenSyncReminder('backend_python/src/schemas/__init__.py', ROOT), null);
  assert.equal(goldenSyncReminder('backend_python/src/services/quote_submission.py', ROOT), null);
});
