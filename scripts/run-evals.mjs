#!/usr/bin/env node
/**
 * ADK evals in their own environment: backend_python/.venv-eval on Python 3.14.
 *
 * The evals need google-adk[eval], which is outside uv.lock, and on Python 3.15
 * its litellm -> fastuuid dependency has no wheels (building it needs Rust).
 * Evals test the agents' behaviour, not the interpreter, so they run on the
 * last Python with wheels for everything; the app and its tests run on
 * backend_python/.python-version.
 *
 * Usage: node scripts/run-evals.mjs [arguments of tests/evals/run_evals.py]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVAL_PYTHON = "3.14";
const backend = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "backend_python",
);
const env = {
  ...process.env,
  UV_PROJECT_ENVIRONMENT: ".venv-eval",
  UV_PYTHON: EVAL_PYTHON,
};

function uv(args, { capture = false } = {}) {
  const result = spawnSync("uv", args, {
    cwd: backend,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

// The locked app dependencies, then the eval extra at the locked google-adk version.
uv(["sync", "--all-extras", "--locked", "--quiet"]);
// `uv pip` reads UV_PYTHON, not UV_PROJECT_ENVIRONMENT: name the environment.
const adkVersion = uv(["pip", "show", "--python", ".venv-eval", "google-adk"], {
  capture: true,
}).match(/^Version: (\S+)/m)?.[1];
if (!adkVersion) {
  console.error("google-adk is not installed in .venv-eval");
  process.exit(1);
}
uv([
  "pip",
  "install",
  "--quiet",
  "--python",
  ".venv-eval",
  `google-adk[eval]==${adkVersion}`,
]);
uv([
  "run",
  "--no-sync",
  "python",
  "tests/evals/run_evals.py",
  ...process.argv.slice(2),
]);
