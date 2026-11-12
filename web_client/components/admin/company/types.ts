import type { CompanyIssue } from '@/lib/admin/company-info-logic';
import type { CompanyInfo } from '@/types/company-info';

/** What every tab of the company info editor receives: the draft, a way to change a part of it, the problems to show. */
export interface TabProps {
    info: CompanyInfo;
    /** The last saved version: a tab knows what is new (a new section's slug is still editable). */
    saved: CompanyInfo;
    onChange: (patch: Partial<CompanyInfo>) => void;
    /** Only the problems to show: empty until the admin has tried to save. */
    issues: CompanyIssue[];
}
