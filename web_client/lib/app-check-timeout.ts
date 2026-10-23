/**
 * Upper bound on the App Check token request.
 *
 * reCAPTCHA has no timeout: when its script never loads or never answers
 * (Safari content blockers, VPN, weak network), App Check's getToken() never
 * settles and every caller waits with it. Firebase Auth is one of them:
 * signInWithRedirect awaits the App Check token before leaving for Google, so
 * on iPhone the Google button spun with no end and Google never opened.
 * Firebase Auth does not enforce App Check, so the login can go on without one.
 *
 * Past the limit the provider rejects: App Check hands callers its dummy token
 * with the error (it never throws), the login leaves for Google, and backend
 * calls get a readable "missing token" refusal instead of hanging. The next
 * getToken() asks reCAPTCHA again.
 */
export const APP_CHECK_TOKEN_TIMEOUT_MS = 5000;

type TokenFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Wrap the provider's token request with a timeout, in place.
 *
 * `getToken` is internal to the reCAPTCHA providers (left out of the public
 * typings), hence the cast; `__tests__/app-check-timeout.test.ts` fails if an
 * SDK update renames it.
 */
export function withTokenTimeout<P extends object>(
    provider: P,
    timeoutMs: number = APP_CHECK_TOKEN_TIMEOUT_MS
): P {
    const internal = provider as unknown as { getToken?: TokenFn };
    const getToken = internal.getToken;
    if (typeof getToken !== 'function') return provider;

    internal.getToken = (...args: unknown[]) =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`App Check token timed out after ${timeoutMs} ms`)),
                timeoutMs
            );
            getToken.apply(provider, args).then(
                (token) => {
                    clearTimeout(timer);
                    resolve(token);
                },
                (error: unknown) => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    return provider;
}
