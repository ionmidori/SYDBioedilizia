/**
 * Reading the company info from the backend (3-Tier: never Firestore directly).
 */
import { publicCompanyInfoSchema, type CompanyInfo } from '@/types/company-info';
import { COMPANY_INFO_ENDPOINT } from './config';

/**
 * Requests the company info; null on any failure (network, status, or a body that
 * is not a valid company info). Every failure is logged.
 */
export async function requestCompanyInfo(apiRoot: string, init?: RequestInit): Promise<CompanyInfo | null> {
    try {
        const res = await fetch(`${apiRoot}${COMPANY_INFO_ENDPOINT}`, init);
        if (!res.ok) {
            console.error(`[company-info] fetch failed with status ${res.status}`);
            return null;
        }
        const parsed = publicCompanyInfoSchema.safeParse(await res.json());
        if (!parsed.success) {
            console.error('[company-info] response is not a valid company info', parsed.error.issues.slice(0, 3));
            return null;
        }
        return parsed.data.info;
    } catch (error) {
        console.error('[company-info] fetch threw', error);
        return null;
    }
}
