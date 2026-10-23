import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    badCommitSubjects,
    classifyChanges,
    parseArgs,
    planSteps,
    secretHits,
    tailLines,
} from './preflight-plan.mjs';

const workflow = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('scope follows the CI path filters', () => {
    assert.deepEqual(
        [classifyChanges(['web_client/lib/a.ts']).frontend, classifyChanges(['web_client/lib/a.ts']).backend],
        [true, false]
    );
    assert.equal(classifyChanges(['backend_python/src/x.py']).backend, true);
    assert.equal(classifyChanges(['backend_python/src/x.py']).frontend, false);
    // Root manifests resolve web_client's deps; any workflow guards setup-node.
    assert.equal(classifyChanges(['package-lock.json']).frontend, true);
    assert.equal(classifyChanges(['.github/workflows/e2e-smoke.yml']).frontend, true);
    assert.equal(classifyChanges(['.github/workflows/backend-tests.yml']).backend, true);
    const docsOnly = classifyChanges(['README.md', 'directives/PROJECT_CONTEXT_SUMMARY.md']);
    assert.equal(docsOnly.frontend || docsOnly.backend, false);
});

test('windows separators are normalised', () => {
    assert.equal(classifyChanges(['web_client\\lib\\a.ts']).frontend, true);
});

test('docker build is only relevant when the image inputs change', () => {
    assert.equal(classifyChanges(['backend_python/uv.lock']).docker, true);
    assert.equal(classifyChanges(['backend_python/Dockerfile']).docker, true);
    assert.equal(classifyChanges(['backend_python/src/x.py']).docker, false);
});

test('agent surface and golden sync warnings', () => {
    assert.equal(classifyChanges(['backend_python/src/adk/agents.py']).agentSurface, true);
    assert.equal(classifyChanges(['backend_python/src/prompts/components/modes.py']).agentSurface, true);
    assert.equal(classifyChanges(['backend_python/src/services/x.py']).agentSurface, false);
    assert.equal(classifyChanges(['backend_python/src/models/chat.py']).modelsWithoutTypes, true);
    assert.equal(
        classifyChanges(['backend_python/src/models/chat.py', 'web_client/types/chat.ts']).modelsWithoutTypes,
        false
    );
});

test('secret files: real env files flagged, .env.example allowed', () => {
    const { secretFiles } = classifyChanges([
        'web_client/.env.local',
        '.env',
        'backend_python/.env.production',
        '.env.example',
        'backend_python/.env.example',
        'keys/server.pem',
        'creds/firebase-adminsdk-abc.json',
        'web_client/lib/env.ts',
    ]);
    assert.deepEqual(secretFiles, [
        'web_client/.env.local',
        '.env',
        'backend_python/.env.production',
        'keys/server.pem',
        'creds/firebase-adminsdk-abc.json',
    ]);
});

test('secret content is found in added lines only', () => {
    const header = '-----BEGIN ' + 'PRIVATE KEY-----';
    assert.equal(secretHits(`+++ b/x\n+${header}\n`).length, 1);
    assert.equal(secretHits(`-${header}\n context\n`).length, 0);
    assert.equal(secretHits('+const ok = "AKIA' + 'ABCDEFGHIJKLMNOP"\n').length, 1);
    assert.equal(secretHits('+const nothing = 1\n').length, 0);
});

test('commit subjects follow the semantic-pr types', () => {
    assert.deepEqual(badCommitSubjects(['fix(auth): x', 'feat: y', 'chore(deps)!: z', 'Merge branch main']), []);
    assert.deepEqual(badCommitSubjects(['wip', 'Fix: x', 'fix(auth) x']), ['wip', 'Fix: x', 'fix(auth) x']);
});

test('argument parsing', () => {
    assert.deepEqual(parseArgs(['--fast', '--base', 'dev', '--only', 'a,b']).only, new Set(['a', 'b']));
    assert.equal(parseArgs(['--base=dev']).base, 'dev');
    assert.deepEqual(parseArgs(['--nope']).unknown, ['--nope']);
});

test('tail keeps the last non-empty lines without ANSI codes', () => {
    assert.deepEqual(tailLines('a\n\n\u001b[31mb\u001b[0m\nc\n', 2), ['b', 'c']);
});

test('fast mode drops coverage, build and audits', () => {
    const scope = { frontend: true, backend: true, docker: true };
    const fast = planSteps(scope, { fast: true, docker: true }).map((s) => s.id);
    assert.deepEqual(fast, ['fe-lint', 'fe-types', 'fe-test', 'be-lock', 'be-ruff', 'be-pyright', 'be-test']);
    const full = planSteps(scope, { fast: false, docker: true }).map((s) => s.id);
    for (const id of ['fe-build', 'fe-audit-prod', 'fe-audit-all', 'be-docker', 'be-audit']) assert.ok(full.includes(id), id);
    assert.ok(!planSteps(scope, { fast: false, docker: false }).some((s) => s.id === 'be-docker'));
});

// The preflight is only worth trusting while it matches CI: fail on drift.
test('full-mode commands are the ones the CI workflows run', () => {
    const ci = { frontend: workflow('frontend-checks.yml'), backend: workflow('backend-tests.yml') };
    const steps = planSteps({ frontend: true, backend: true, docker: true }, { fast: false, docker: true });
    for (const step of steps) {
        if (step.id === 'be-test') continue; // output flags differ; floors checked below
        const expected = step.id === 'be-docker' ? 'docker build -t' : step.cmd;
        assert.ok(ci[step.group].includes(expected), `${step.id}: "${expected}" non è più nel workflow ${step.group}`);
    }
    const floor = (text) => /--cov-fail-under=(\d+)/.exec(text)?.[1];
    const backendTest = steps.find((s) => s.id === 'be-test').cmd;
    assert.equal(floor(backendTest), floor(ci.backend), 'soglia coverage backend diversa dalla CI');
    assert.ok(ci.backend.includes('-m "not integration"') && backendTest.includes('-m "not integration"'));
});

test('build placeholders match the CI build step', () => {
    const ci = workflow('frontend-checks.yml');
    const build = planSteps({ frontend: true }, {}).find((s) => s.id === 'fe-build');
    for (const [key, value] of Object.entries(build.env)) {
        if (key === 'NEXT_DIST_DIR') continue;
        assert.ok(ci.includes(`${key}: '${value}'`), `${key}=${value} diverso dal workflow`);
    }
});
