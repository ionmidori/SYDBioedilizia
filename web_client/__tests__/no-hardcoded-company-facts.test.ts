/**
 * The company facts (phone, email, VAT id, street) live in the company info,
 * edited from the admin console (Phase 141). This guard fails when one of them is
 * written again in the app's source: a copy there would silently outlive an edit
 * made in the console.
 *
 * Tests, test utilities and the seed (the safety net, a JSON file) are exempt.
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import seed from '@/lib/company-info/seed.json';

const ROOT = path.resolve(__dirname, '..');
const SCANNED = ['app', 'components', 'lib', 'hooks'];
const EXEMPT_DIRS = new Set(['__tests__', '__test-utils__', 'test-utils', 'node_modules', '.next']);

function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return EXEMPT_DIRS.has(entry.name) ? [] : sources(full);
        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Digits with any separators in between: "375 5463599", "375-546-3599", "3755463599". */
const spaced = (digits: string) => new RegExp(digits.split('').join('[\\s.\\-]*'));

const { identity } = seed.info;
const nationalPhone = identity.phone.replace(/\D/g, '').replace(/^39/, '');
const FACTS: [string, RegExp][] = [
    ['phone number', spaced(nationalPhone)],
    ['email', new RegExp(escape(identity.email), 'i')],
    ['VAT id', new RegExp(identity.vat_id)],
    ['street', new RegExp(escape(identity.address.street.split(',')[0]), 'i')],
];

describe('company facts in the source', () => {
    const files = SCANNED.flatMap((dir) => sources(path.join(ROOT, dir)));

    it('scans the app source', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it.each(FACTS)('has no %s written in the code', (_label, pattern) => {
        const found = files
            .filter((file) => pattern.test(readFileSync(file, 'utf-8')))
            .map((file) => path.relative(ROOT, file));
        expect(found).toEqual([]);
    });

    it('would catch a fact (the patterns match what they should)', () => {
        expect(FACTS[0][1].test('tel:+39 375 546 3599')).toBe(true);
        expect(FACTS[0][1].test('€ 1.234,56')).toBe(false);
        expect(FACTS[1][1].test('Scrivi a SYDBioedilizia@Gmail.com')).toBe(true);
    });
});
