import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Ignored Build Step contract: exit 0 = SKIP the Vercel build, exit 1 = BUILD.
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'vercel-ignore-build.sh');

let repo: string;

const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

const commit = (file: string, msg: string) => {
    const abs = path.join(repo, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.appendFileSync(abs, `${msg}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', msg);
    return git('rev-parse', 'HEAD');
};

const run = (env: Record<string, string>) =>
    spawnSync('bash', [SCRIPT], {
        cwd: path.join(repo, 'web_client'),
        env: { ...process.env, VERCEL_GIT_COMMIT_REF: 'feat/x', VERCEL_GIT_PREVIOUS_SHA: '', ...env },
        encoding: 'utf8',
    }).status;

beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vib-'));
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    git('config', 'commit.gpgsign', 'false');
    commit('web_client/app.ts', 'init');
    commit('package-lock.json', 'init lock');
});

afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('vercel-ignore-build.sh', () => {
    it('skips Dependabot branches', () => {
        commit('web_client/app.ts', 'bump');
        expect(run({ VERCEL_GIT_COMMIT_REF: 'dependabot/npm_and_yarn/next-16.3.9' })).toBe(0);
    });

    it('builds the first deployment of a branch (no previous SHA)', () => {
        commit('backend_python/main.py', 'backend only');
        expect(run({})).toBe(1);
    });

    it('builds when the previous SHA is not in the clone', () => {
        commit('backend_python/main.py', 'backend only');
        expect(run({ VERCEL_GIT_PREVIOUS_SHA: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })).toBe(1);
    });

    it('builds a redeploy of the already-deployed commit (e.g. after an env var change)', () => {
        const head = git('rev-parse', 'HEAD');
        expect(run({ VERCEL_GIT_PREVIOUS_SHA: head })).toBe(1);
    });

    it('skips when only non-frontend paths changed since the last deploy', () => {
        const prev = git('rev-parse', 'HEAD');
        commit('backend_python/main.py', 'backend');
        commit('directives/PROJECT_CONTEXT_SUMMARY.md', 'docs');
        expect(run({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe(0);
    });

    it('builds when web_client changed in an earlier commit of the push', () => {
        const prev = git('rev-parse', 'HEAD');
        commit('web_client/app.ts', 'frontend');
        commit('backend_python/main.py', 'backend last');
        expect(run({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe(1);
    });

    it.each(['package-lock.json', 'package.json', '.npmrc'])('builds when root %s changed', (file) => {
        const prev = git('rev-parse', 'HEAD');
        commit(file, 'root manifest');
        expect(run({ VERCEL_GIT_PREVIOUS_SHA: prev })).toBe(1);
    });
});
