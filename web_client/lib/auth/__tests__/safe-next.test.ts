/**
 * The page a magic link returns to comes from the link itself, so anyone can
 * write it: only a path of this site is followed, anything else goes home
 * (no open redirect).
 */
import { safeNextPath } from '../safe-next';

describe('safeNextPath', () => {
    it.each([
        ['/faq', '/faq'],
        ['/', '/'],
        ['/?projectId=abc', '/?projectId=abc'],
        ['/blog/bagno#costi', '/blog/bagno#costi'],
        ['/dashboard/abc?tab=files', '/dashboard/abc?tab=files'],
    ])('follows a path of this site: %s', (raw, expected) => {
        expect(safeNextPath(raw)).toBe(expected);
    });

    it.each([
        ['an absolute URL', 'https://evil.example/phish'],
        ['a protocol-relative URL', '//evil.example/phish'],
        ['a backslash host', '/\\evil.example'],
        ['a double backslash', '\\\\evil.example'],
        ['a script URL', 'javascript:alert(1)'],
        ['a data URL', 'data:text/html,hi'],
        ['a leading space', ' /faq'],
        ['a leading tab before slashes', '\t//evil.example'],
        ['a control character', '/fa\nq'],
        ['a relative path', 'faq'],
        ['an empty string', ''],
        ['nothing', null],
        ['the verification page itself', '/auth/verify?next=/faq'],
    ])('goes home for %s', (_name, raw) => {
        expect(safeNextPath(raw)).toBe('/');
    });
});
