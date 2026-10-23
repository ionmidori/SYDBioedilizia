#!/usr/bin/env node
/**
 * Pre-PR gate: runs what CI would run, only for the files this branch touches.
 *
 *   npm run preflight                  full check (CI parity), changed scope only
 *   npm run preflight:fast             lint + types + tests, no coverage/build/audit
 *   npm run preflight -- --only fe-types,be-ruff   re-run just those steps
 *
 * Built for an agent as much as for a person: one line per step, and for a
 * failure only the tail of its output plus the path of the full log, so a
 * failing run costs a few dozen lines of context instead of thousands.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { badCommitSubjects, classifyChanges, parseArgs, planSteps, secretHits, tailLines } from './preflight-plan.mjs';

const TAIL_LINES = 30;
const STEP_TIMEOUT_MS = 15 * 60 * 1000;
const KIND_RANK = { static: 0, test: 1, build: 2 };
const ICON = { ok: '✓', warn: '⚠', fail: '✗', skip: '–' };

const HELP = `Uso: npm run preflight -- [opzioni]

  (nessuna)        controlli della CI sui soli file toccati (frontend e/o backend)
  --fast           lint + type-check + test, senza coverage, build, audit
  --all            ignora i file toccati: frontend e backend
  --keep-going     non saltare test/build dopo un errore statico
  --only a,b       solo questi step (ids da --list), senza i controlli del repo
  --list           mostra cosa verrebbe eseguito, senza eseguirlo
  --base <ref>     confronto per i file toccati (default: origin/main)
`;

const root = (() => {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (r.status !== 0) {
        console.error('PREFLIGHT: non sono dentro un repository git.');
        process.exit(2);
    }
    return path.resolve(r.stdout.trim());
})();

function git(args) {
    const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });
    return r.status === 0 ? r.stdout : null;
}

const lines = (text) => (text ?? '').split('\n').filter(Boolean);

function resolveBase(requested) {
    for (const ref of [requested, 'origin/main', 'main']) {
        if (ref && git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null) return ref;
    }
    return null;
}

/** Committed on the branch + staged/unstaged + untracked: what a PR from here would carry. */
function changedFiles(base) {
    const committed = base ? lines(git(['diff', '--name-only', `${base}...HEAD`])) : [];
    const uncommitted = lines(git(['diff', '--name-only', 'HEAD']));
    const untracked = lines(git(['ls-files', '--others', '--exclude-standard']));
    return [...new Set([...committed, ...uncommitted, ...untracked])];
}

function repoChecks({ branch, base, files, scope }) {
    const out = [];
    const add = (id, status, detail) => out.push({ id, status, detail });

    if (branch === 'main') add('branch', 'fail', 'sei su main: crea un branch di lavoro prima della PR');
    else if (!branch) add('branch', 'warn', 'HEAD scollegata (detached)');
    else add('branch', 'ok', branch);

    const diff = `${base ? git(['diff', '-U0', `${base}...HEAD`]) ?? '' : ''}\n${git(['diff', '-U0', 'HEAD']) ?? ''}`;
    const contentHits = secretHits(diff);
    if (scope.secretFiles.length || contentHits.length) {
        const what = [...scope.secretFiles, ...contentHits.map((h) => `contenuto ${h}`)];
        add('secrets', 'fail', `possibili segreti: ${what.join(', ')}`);
    } else {
        add('secrets', 'ok', 'nessun .env, chiave o token nelle modifiche');
    }

    const dirty = lines(git(['status', '--porcelain'])).length;
    if (dirty) add('commit', 'warn', `modifiche non committate (${dirty} voci in git status): la PR contiene solo i commit`);

    const subjects = base ? lines(git(['log', '--format=%s', `${base}..HEAD`])) : [];
    const bad = badCommitSubjects(subjects);
    if (bad.length) add('commit-msg', 'warn', `fuori da feat|fix|docs|…(scope): ${bad.slice(0, 2).join(' | ')}`);

    if (scope.lockfile) {
        const npm = spawnSync('npm -v', { encoding: 'utf8', shell: true });
        const major = Number.parseInt(npm.stdout, 10);
        if (major !== 10) {
            add('lockfile', 'warn', `package-lock.json modificato con npm ${npm.stdout.trim()}: la CI usa npm 10.9.9, rigenera con npm 10`);
        }
    }
    if (scope.modelsWithoutTypes) {
        add('golden-sync', 'warn', 'cambiato un modello Pydantic (src/models) ma nessun tipo in web_client/types');
    }
    if (scope.agentSurface) {
        add('evals', 'warn', 'cambiati agenti/prompt/tool: la CI non li prova. Lancia npm run eval:run (serve GOOGLE_API_KEY)');
    }
    return out;
}

function killTree(child) {
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
        try {
            process.kill(-child.pid, 'SIGKILL');
        } catch {
            child.kill('SIGKILL');
        }
    }
}

function runStep(step, logDir) {
    return new Promise((resolve) => {
        const log = path.join(logDir, `${step.id}.log`);
        const sink = createWriteStream(log);
        const started = Date.now();
        const child = spawn(step.cmd, {
            cwd: path.join(root, step.cwd),
            shell: true,
            detached: process.platform !== 'win32',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1', ...step.env },
        });
        child.stdout.pipe(sink, { end: false });
        child.stderr.pipe(sink, { end: false });

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
        }, STEP_TIMEOUT_MS);

        const finish = (code, error) => {
            clearTimeout(timer);
            sink.end(() =>
                resolve({
                    id: step.id,
                    cmd: step.cmd,
                    log,
                    ms: Date.now() - started,
                    status: code === 0 ? 'ok' : 'fail',
                    detail: timedOut ? `timeout dopo ${STEP_TIMEOUT_MS / 60000} min` : error ? `non avviato: ${error.message}` : '',
                })
            );
        };
        child.on('error', (error) => finish(1, error));
        child.on('close', (code) => finish(code ?? 1));
    });
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function printLive(result) {
    console.log(`${ICON[result.status]} ${result.id.padEnd(14)} ${result.detail || seconds(result.ms)}`);
}

// Tests and builds are CPU-bound and timing-sensitive (Jest's 5 s test timeout):
// run together, frontend and backend suites made two Testimonials tests time out
// (green when run alone). They take turns; linters, type-checkers and audits overlap.
let heavyQueue = Promise.resolve();
function exclusively(task) {
    const run = heavyQueue.then(task);
    heavyQueue = run.catch(() => {});
    return run;
}

/** A group runs its steps in order; a static failure skips tests+build, a test failure skips build. */
async function runGroup(steps, { keepGoing }, logDir) {
    const results = [];
    let blockedFrom = Infinity;
    for (const step of steps) {
        const rank = KIND_RANK[step.kind];
        if (!keepGoing && rank !== undefined && rank >= blockedFrom) {
            const skipped = { id: step.id, status: 'skip', ms: 0, detail: 'saltato: correggi prima gli errori sopra' };
            printLive(skipped);
            results.push(skipped);
            continue;
        }
        const result = await (rank >= KIND_RANK.test ? exclusively(() => runStep(step, logDir)) : runStep(step, logDir));
        printLive(result);
        results.push(result);
        if (result.status === 'fail' && rank !== undefined) blockedFrom = Math.min(blockedFrom, rank + 1);
    }
    return results;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || args.unknown.length) {
        if (args.unknown.length) console.error(`Opzione sconosciuta: ${args.unknown.join(' ')}\n`);
        console.log(HELP);
        return args.unknown.length ? 2 : 0;
    }

    const started = Date.now();
    const branch = (git(['branch', '--show-current']) ?? '').trim();
    const base = resolveBase(args.base);
    const files = changedFiles(base);
    const scope = classifyChanges(files);
    const imageInputsChanged = scope.docker;
    if (args.all || args.only) Object.assign(scope, { frontend: true, backend: true, docker: true });

    const dockerAvailable = scope.docker && spawnSync('docker --version', { shell: true }).status === 0;
    let steps = planSteps(scope, { fast: args.fast, docker: dockerAvailable });

    if (args.only) {
        const known = new Set(steps.map((s) => s.id));
        const unknown = [...args.only].filter((id) => !known.has(id));
        if (unknown.length) {
            console.error(`Step sconosciuti: ${unknown.join(', ')}\nDisponibili: ${[...known].join(', ')}`);
            return 2;
        }
        steps = steps.filter((s) => args.only.has(s.id));
    }

    const areas = ['frontend', 'backend'].filter((a) => scope[a]);
    console.log(
        `PREFLIGHT  branch=${branch || '(detached)'}  base=${base ?? 'nessuna'}  file=${files.length}  ` +
            `ambito=${areas.join('+') || 'nessuno'}  modo=${args.fast ? 'fast' : 'completo'}`
    );
    if (!base) console.log('⚠ base non trovata (né origin/main né main): controlli sul solo working tree');

    if (args.list) {
        for (const s of steps) console.log(`  ${s.id.padEnd(14)} ${s.cwd}> ${s.cmd}`);
        if (scope.docker && !dockerAvailable && !args.fast) console.log('  (be-docker: docker non disponibile, la CI lo esegue)');
        return 0;
    }

    const checks = args.only ? [] : repoChecks({ branch, base, files, scope });
    for (const c of checks) console.log(`${ICON[c.status]} ${c.id.padEnd(14)} ${c.detail}`);

    if (imageInputsChanged && !dockerAvailable && !args.fast && !args.only) {
        console.log('⚠ be-docker      Dockerfile/lock cambiati ma docker non è disponibile: la build dell\'immagine resta alla CI');
    }
    if (!steps.length) {
        console.log(areas.length ? '' : 'Nessun file frontend/backend toccato: nessun controllo di build da eseguire.');
    }

    const logDir = path.join(os.tmpdir(), 'syd-preflight', new Date().toISOString().replaceAll(':', '-'));
    mkdirSync(logDir, { recursive: true });

    const groups = ['frontend', 'backend'].map((g) => steps.filter((s) => s.group === g)).filter((g) => g.length);
    const results = (await Promise.all(groups.map((g) => runGroup(g, args, logDir)))).flat();

    const failures = [...checks.filter((c) => c.status === 'fail'), ...results.filter((r) => r.status === 'fail')];
    for (const failure of results.filter((r) => r.status === 'fail')) {
        const text = await import('node:fs/promises').then((fs) => fs.readFile(failure.log, 'utf8'));
        console.log(`\n✗ ${failure.id}  (${failure.cmd})`);
        for (const line of tailLines(text, TAIL_LINES)) console.log(`  ┆ ${line}`);
        console.log(`  log completo: ${failure.log}`);
    }

    const warnings = checks.filter((c) => c.status === 'warn').length;
    const total = seconds(Date.now() - started);
    if (failures.length) {
        const rerun = results.filter((r) => r.status === 'fail').map((r) => r.id);
        console.log(`\nPREFLIGHT FALLITO — ${failures.length} controlli rossi, ${warnings} avvisi, ${total}`);
        if (rerun.length) console.log(`Dopo la correzione rilancia solo: npm run preflight -- --only ${rerun.join(',')}`);
        return 1;
    }
    console.log(`\nPREFLIGHT OK — ${results.length + checks.length} controlli, ${warnings} avvisi, ${total}`);
    return 0;
}

process.exitCode = await main();
