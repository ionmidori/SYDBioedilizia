/**
 * Pure logic behind scripts/preflight.mjs: which checks apply to a change,
 * and the commands that run them. No I/O here, so node:test covers it
 * (scripts/preflight.test.mjs) -- a wrong scope would silently skip a check
 * that CI then fails on.
 *
 * The commands mirror .github/workflows/{frontend-checks,backend-tests}.yml;
 * the test fails when they drift apart. Change them together.
 */
import { stripVTControlCharacters } from 'node:util';

// Allowed PR title types, from .github/workflows/semantic-pr.yml.
const COMMIT_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore'];
const COMMIT_SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([^)]+\\))?!?: \\S`);

// Same trigger as the CI path filters: root manifests resolve web_client's deps.
const ROOT_NPM_FILES = new Set(['package.json', 'package-lock.json', '.npmrc']);

// Prompts, agents and tools change what the chatbot says and does. Their evals
// need a live model (GOOGLE_API_KEY, cost, non-deterministic), so CI never runs
// them: the preflight only reminds.
const AGENT_SURFACE = [
    /^backend_python\/src\/adk\//,
    /^backend_python\/src\/prompts\//,
    /^backend_python\/src\/tools\//,
    /^backend_python\/tests\/evals\//,
];

const SECRET_FILE = [
    /(^|\/)\.env(\.(?!example$)[^/]+)?$/,
    /\.(pem|p12|pfx)$/i,
    /(^|\/)[^/]*(service-?account|firebase-adminsdk)[^/]*\.json$/i,
];

const SECRET_CONTENT = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
];

const normalize = (file) => file.replaceAll('\\', '/');

export function classifyChanges(files) {
    const list = files.map(normalize);
    const any = (test) => list.some(test);
    return {
        frontend: any(
            (f) => f.startsWith('web_client/') || ROOT_NPM_FILES.has(f) || f.startsWith('.github/workflows/')
        ),
        backend: any((f) => f.startsWith('backend_python/') || f === '.github/workflows/backend-tests.yml'),
        lockfile: list.includes('package-lock.json'),
        docker: any((f) => /^backend_python\/(Dockerfile|\.dockerignore|pyproject\.toml|uv\.lock)$/.test(f)),
        agentSurface: any((f) => AGENT_SURFACE.some((re) => re.test(f))),
        // Golden Sync: a Pydantic model changed but no TypeScript type did.
        modelsWithoutTypes:
            any((f) => /^backend_python\/src\/models\/.+\.py$/.test(f)) &&
            !any((f) => f.startsWith('web_client/types/')),
        secretFiles: list.filter((f) => SECRET_FILE.some((re) => re.test(f))),
    };
}

const FRONTEND_BUILD_ENV = {
    // Placeholders, as in CI: the build must not need live secrets. They win
    // over web_client/.env.local, so the result does not depend on the machine.
    NEXT_PUBLIC_FIREBASE_API_KEY: 'ci-placeholder-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ci-placeholder.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ci-placeholder',
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'ci-placeholder-recaptcha',
    NEXT_PUBLIC_ENABLE_APP_CHECK: 'false',
    // Its own dist dir: never clobbers a running `next dev`.
    NEXT_DIST_DIR: '.next-preflight',
};

/**
 * kind orders the gate inside a group: a failure in `static` skips `test` and
 * `build`, a failure in `test` skips `build` (no point building what does not
 * pass). `audit` never gates and is never gated: a new advisory on main must
 * not hide a real failure in the code.
 */
export function planSteps(scope, { fast = false, docker = false } = {}) {
    const steps = [];
    if (scope.frontend) {
        const web = 'web_client';
        steps.push(
            { id: 'fe-lint', group: 'frontend', kind: 'static', cwd: web, cmd: 'npm run lint' },
            { id: 'fe-types', group: 'frontend', kind: 'static', cwd: web, cmd: 'npm run type-check' },
            {
                id: 'fe-test',
                group: 'frontend',
                kind: 'test',
                cwd: web,
                // The coverage floors in jest.config.js only apply with --coverage.
                cmd: fast ? 'npm test -- --ci' : 'npm test -- --ci --coverage',
            }
        );
        if (!fast) {
            steps.push(
                { id: 'fe-build', group: 'frontend', kind: 'build', cwd: web, cmd: 'npm run build', env: FRONTEND_BUILD_ENV },
                { id: 'fe-audit-prod', group: 'frontend', kind: 'audit', cwd: web, cmd: 'npm audit --omit=dev --audit-level=high' },
                { id: 'fe-audit-all', group: 'frontend', kind: 'audit', cwd: web, cmd: 'npm audit --audit-level=critical' }
            );
        }
    }
    if (scope.backend) {
        const api = 'backend_python';
        steps.push(
            { id: 'be-lock', group: 'backend', kind: 'static', cwd: api, cmd: 'uv lock --check' },
            { id: 'be-ruff', group: 'backend', kind: 'static', cwd: api, cmd: 'uv run ruff check src/ main.py tests/' },
            { id: 'be-pyright', group: 'backend', kind: 'static', cwd: api, cmd: 'uv run pyright' },
            {
                id: 'be-test',
                group: 'backend',
                kind: 'test',
                cwd: api,
                // `-m "not integration"`: never call the live Gemini API.
                cmd: fast
                    ? 'uv run pytest -q -x -m "not integration"'
                    : 'uv run pytest -q --tb=short --cov=src --cov-report= --cov-fail-under=55 -m "not integration"',
            }
        );
        if (!fast) {
            if (scope.docker && docker) {
                steps.push({
                    id: 'be-docker',
                    group: 'backend',
                    kind: 'build',
                    cwd: '.',
                    cmd: 'docker build -t syd-brain-preflight ./backend_python',
                });
            }
            steps.push({
                id: 'be-audit',
                group: 'backend',
                kind: 'audit',
                cwd: api,
                cmd: 'uv run pip-audit --strict --desc --ignore-vuln CVE-2026-28277',
            });
        }
    }
    return steps;
}

export function parseArgs(argv) {
    const out = { fast: false, all: false, keepGoing: false, list: false, help: false, base: null, only: null, unknown: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--fast') out.fast = true;
        else if (arg === '--all') out.all = true;
        else if (arg === '--keep-going') out.keepGoing = true;
        else if (arg === '--list') out.list = true;
        else if (arg === '--help' || arg === '-h') out.help = true;
        else if (arg === '--base') out.base = argv[++i] ?? null;
        else if (arg.startsWith('--base=')) out.base = arg.slice('--base='.length);
        else if (arg === '--only') out.only = new Set((argv[++i] ?? '').split(',').filter(Boolean));
        else if (arg.startsWith('--only=')) out.only = new Set(arg.slice('--only='.length).split(',').filter(Boolean));
        else out.unknown.push(arg);
    }
    return out;
}

/** Last `count` non-empty lines, ANSI-free: all the context a failure needs. */
export function tailLines(text, count) {
    const lines = stripVTControlCharacters(text)
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '');
    return lines.slice(-count);
}

/** Commit subjects that the semantic-pr check would reject as a PR title. */
export function badCommitSubjects(subjects) {
    return subjects.filter((s) => !s.startsWith('Merge ') && !COMMIT_SUBJECT.test(s));
}

/** Added lines (`+`, not the `+++` header) of a unified diff that look like a credential. */
export function secretHits(diffText) {
    const hits = [];
    for (const line of diffText.split('\n')) {
        if (!line.startsWith('+') || line.startsWith('+++')) continue;
        const re = SECRET_CONTENT.find((pattern) => pattern.test(line));
        if (re) hits.push(`${re.source.slice(0, 28)}…`);
    }
    return hits;
}
