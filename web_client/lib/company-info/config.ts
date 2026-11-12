/**
 * Company info display settings. The content itself (contacts, FAQ, About, ...)
 * lives in Firestore and is edited from the admin console; see types/company-info.ts.
 */

/**
 * How long a server-rendered page reuses the company info before asking the
 * backend again (ISR). The backend caches it too (CompanyInfoService, 5 min), so
 * a console edit reaches the site within about 6 minutes.
 */
export const COMPANY_INFO_REVALIDATE_SECONDS = 60;

/** Public endpoint path, relative to the API root (`/api` on the backend). */
export const COMPANY_INFO_ENDPOINT = '/content/company-info';
