/**
 * The company info the site falls back to when the backend cannot be reached.
 *
 * seed.json is a copy of backend_python/src/data/company_info.seed.json (a backend
 * test keeps the two identical). It is the safety net only: once the company info
 * is saved from the admin console, the site shows that one.
 */
import { companyInfoSchema, type CompanyInfo } from '@/types/company-info';
import seedFile from './seed.json';

export const SEED_COMPANY_INFO: CompanyInfo = companyInfoSchema.parse(seedFile.info);
