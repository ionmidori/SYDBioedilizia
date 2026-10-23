import path from 'path';
import { APP_CHECK_TOKEN_TIMEOUT_MS, withTokenTimeout } from '../app-check-timeout';

type Token = { token: string };

function fakeProvider(getToken: () => Promise<Token>) {
    return { getToken: jest.fn(getToken) };
}

describe('withTokenTimeout', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('rejects when reCAPTCHA never answers, so the login is not held forever', async () => {
        jest.useFakeTimers();
        const provider = withTokenTimeout(fakeProvider(() => new Promise<Token>(() => {})));

        const result = provider.getToken();
        jest.advanceTimersByTime(APP_CHECK_TOKEN_TIMEOUT_MS);

        await expect(result).rejects.toThrow(`timed out after ${APP_CHECK_TOKEN_TIMEOUT_MS} ms`);
    });

    it('passes a token through and clears the timer', async () => {
        jest.useFakeTimers();
        const provider = withTokenTimeout(fakeProvider(() => Promise.resolve({ token: 'abc' })));

        await expect(provider.getToken()).resolves.toEqual({ token: 'abc' });
        expect(jest.getTimerCount()).toBe(0);
    });

    it('passes the provider error through unchanged', async () => {
        const error = Object.assign(new Error('recaptcha'), { code: 'appCheck/recaptcha-error' });
        const provider = withTokenTimeout(fakeProvider(() => Promise.reject(error)));

        await expect(provider.getToken()).rejects.toBe(error);
    });

    it('keeps the provider as `this` and forwards the arguments', async () => {
        const provider = {
            siteKey: 'key',
            getToken: jest.fn(function (this: { siteKey: string }, limitedUse?: boolean) {
                return Promise.resolve({ token: `${this.siteKey}:${limitedUse}` });
            }),
        };

        withTokenTimeout(provider);

        await expect(provider.getToken(true)).resolves.toEqual({ token: 'key:true' });
    });

    it('leaves a provider without getToken untouched', () => {
        const provider = { initialize: jest.fn() };
        expect(withTokenTimeout(provider)).toEqual({ initialize: provider.initialize });
    });
});

describe('real App Check SDK', () => {
    // jest.setup.js mocks firebase/app-check; load the CommonJS build directly
    // (the package exports map hides dist/, but exposes package.json).
    const sdkPath = path.join(
        path.dirname(require.resolve('@firebase/app-check/package.json')),
        'dist',
        'index.cjs.js'
    );
    const sdk = jest.requireActual(sdkPath) as {
        ReCaptchaV3Provider: new (key: string) => object;
        ReCaptchaEnterpriseProvider: new (key: string) => object;
    };

    it.each([
        ['ReCaptchaV3Provider', sdk.ReCaptchaV3Provider],
        ['ReCaptchaEnterpriseProvider', sdk.ReCaptchaEnterpriseProvider],
    ])('%s still has the internal getToken the timeout wraps', (_name, Provider) => {
        const provider = new Provider('site-key') as { getToken?: unknown };
        const original = provider.getToken;
        expect(typeof original).toBe('function');

        withTokenTimeout(provider);
        expect(provider.getToken).not.toBe(original);
    });
});
