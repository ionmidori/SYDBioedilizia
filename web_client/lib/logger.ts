/**
 * Dev-gated frontend logger.
 *
 * `debug` and `info` are no-ops in production: `process.env.NODE_ENV` is inlined
 * statically by the Next.js bundler, so the guarded branch is dropped from the
 * production bundle entirely. `warn` and `error` always pass through — they are
 * legitimate diagnostics in production too.
 *
 * `debug` deliberately routes to `console.log`, not `console.debug`: Chrome hides
 * `console.debug` behind the "Verbose" log level, which is off by default, so the
 * existing `[ChatProvider]` / `[AuthProvider]` traces would silently disappear
 * from the dev console.
 *
 * This is the only module allowed to call `console.log` (see the `no-console`
 * override in eslint.config.mjs).
 */
const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
    debug: (...args: unknown[]): void => {
        if (isDev) console.log(...args);
    },
    info: (...args: unknown[]): void => {
        if (isDev) console.info(...args);
    },
    warn: (...args: unknown[]): void => {
        console.warn(...args);
    },
    error: (...args: unknown[]): void => {
        console.error(...args);
    },
};
