/**
 * Admin console API client (/api/admin on the backend, via the /api/py rewrite).
 *
 * Every call carries the Firebase ID token + App Check token (fetchWithAuth).
 * The backend is the only authority: it verifies the token and the role=admin
 * claim on every request. Errors keep the HTTP status and the backend
 * `error_code` (ADMIN_REQUIRED, VERSION_CONFLICT, QUOTE_LOCKED…) so the UI can
 * react precisely.
 */
import { z } from 'zod';

import { fetchWithAuth } from '@/lib/api-client';
import {
  type AdminMe,
  type AdminQuoteList,
  type QuoteDossier,
  adminMeSchema,
  adminQuoteListSchema,
  quoteDossierSchema,
} from '@/types/admin-quote';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';
const ADMIN_ROOT = `${API_ROOT}/admin`;

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AdminApiError';
  }

  /** 401/403: not signed in, not an admin, or MFA missing. */
  get isAccessDenied(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function toError(response: Response): Promise<AdminApiError> {
  let body: { error_code?: unknown; message?: unknown; detail?: unknown } = {};
  try {
    body = await response.json();
  } catch {
    // non-JSON error page (proxy, network): keep the status only
  }
  const detail = body.detail && typeof body.detail === 'object' ? (body.detail as Record<string, unknown>) : {};
  return new AdminApiError(
    response.status,
    typeof body.error_code === 'string' ? body.error_code : `HTTP_${response.status}`,
    typeof body.message === 'string' ? body.message : `Richiesta non riuscita (${response.status}).`,
    detail,
  );
}

async function request<S extends z.ZodTypeAny>(path: string, schema: S, init: RequestInit = {}): Promise<z.output<S>> {
  const response = await fetchWithAuth(`${ADMIN_ROOT}${path}`, init);
  if (!response.ok) {
    throw await toError(response);
  }
  return schema.parse(await response.json());
}

export interface QuoteListFilters {
  /** "open" (draft + pending + in review), a status, or a comma-separated list. */
  status?: string;
  /** Quote number, a name token or an email (exact token match). */
  q?: string;
  limit?: number;
}

export const adminApi = {
  me: (): Promise<AdminMe> => request('/me', adminMeSchema),

  listQuotes: (filters: QuoteListFilters, cursor?: string | null): Promise<AdminQuoteList> => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    const q = filters.q?.trim();
    if (q) params.set('q', q);
    params.set('limit', String(filters.limit ?? 25));
    if (cursor) params.set('cursor', cursor);
    return request(`/quotes?${params.toString()}`, adminQuoteListSchema);
  },

  getDossier: (projectId: string): Promise<QuoteDossier> =>
    request(`/quotes/${encodeURIComponent(projectId)}`, quoteDossierSchema),
};
