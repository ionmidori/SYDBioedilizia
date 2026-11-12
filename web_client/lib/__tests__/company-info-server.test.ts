import { requestCompanyInfo } from '@/lib/company-info/api';
import { COMPANY_INFO_REVALIDATE_SECONDS } from '@/lib/company-info/config';
import seedFile from '@/lib/company-info/seed.json';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import {
    getCompanyInfo,
    resetServerCompanyInfoMemory,
    resolveServerCompanyInfo,
} from '@/lib/company-info/server';
import { companyInfoSchema, type CompanyInfo } from '@/types/company-info';

// jsdom has a `window`, where getCompanyInfo() refuses to run: pretend to be the server.
jest.mock('@/lib/company-info/runtime', () => ({ isBrowser: () => false }));

const publicBody = (info: unknown) => ({ version: 0, updated_at: null, info });

let errorSpy: jest.SpyInstance;
beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    resetServerCompanyInfoMemory();
});
afterEach(() => errorSpy.mockRestore());

describe('the bundled seed', () => {
    it('is a valid company info', () => {
        expect(companyInfoSchema.safeParse(seedFile.info).success).toBe(true);
        expect(SEED_COMPANY_INFO.identity.vat_id).toMatch(/^\d{11}$/);
    });
});

describe('resolveServerCompanyInfo', () => {
    it('falls back to the seed when nothing was ever received', () => {
        expect(resolveServerCompanyInfo(null)).toBe(SEED_COMPANY_INFO);
    });

    it('reuses the last good response when the backend fails', () => {
        const info: CompanyInfo = { ...SEED_COMPANY_INFO, hours_note: 'ricevuta' };
        expect(resolveServerCompanyInfo(info)).toBe(info);
        expect(resolveServerCompanyInfo(null)).toBe(info);
    });
});

describe('requestCompanyInfo', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns the info of a valid response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => publicBody(seedFile.info) });
        await expect(requestCompanyInfo('http://x/api')).resolves.toEqual(SEED_COMPANY_INFO);
        expect(global.fetch).toHaveBeenCalledWith('http://x/api/content/company-info', undefined);
    });

    it('is null, and says so, when the request throws', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
        await expect(requestCompanyInfo('http://x/api')).resolves.toBeNull();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[company-info]'), expect.anything());
    });

    it('is null, and says so, on a failing status', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
        await expect(requestCompanyInfo('http://x/api')).resolves.toBeNull();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    });

    it('is null, and says so, when the body is not a company info', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => publicBody({ identity: {} }) });
        await expect(requestCompanyInfo('http://x/api')).resolves.toBeNull();
        expect(errorSpy).toHaveBeenCalled();
    });
});

describe('getCompanyInfo (server)', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('asks the backend directly, cached for the ISR interval', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => publicBody(seedFile.info) });
        await getCompanyInfo();
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/content\/company-info$/),
            expect.objectContaining({ next: { revalidate: COMPANY_INFO_REVALIDATE_SECONDS } }),
        );
    });

    it('never throws when the backend is down: the seed, then the last good copy', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
        await expect(getCompanyInfo()).resolves.toBe(SEED_COMPANY_INFO);

        const info: CompanyInfo = { ...SEED_COMPANY_INFO, hours_note: 'ricevuta' };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => publicBody(info) });
        await getCompanyInfo();
        global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
        await expect(getCompanyInfo()).resolves.toEqual(info);
    });
});
