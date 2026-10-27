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
  type EditQuoteBody,
  type MediaUrlResponse,
  type QuoteDossier,
  type QuoteWriteResponse,
  type SendDefaults,
  type SendQuoteBody,
  type SendQuoteResponse,
  adminMeSchema,
  adminQuoteListSchema,
  mediaUrlResponseSchema,
  quoteDossierSchema,
  quoteWriteResponseSchema,
  sendDefaultsSchema,
  sendQuoteResponseSchema,
} from '@/types/admin-quote';
import {
  type AdminKpis,
  type GdprRunResult,
  type GdprStatus,
  type ModerateBody,
  type ModerateResponse,
  type PortfolioImageUploaded,
  type PortfolioList,
  type PortfolioPatch,
  type PortfolioProject,
  type PortfolioWrite,
  type TestimonialList,
  type TestimonialStatus,
  adminKpisSchema,
  gdprRunResultSchema,
  gdprStatusSchema,
  moderateResponseSchema,
  portfolioImageUploadedSchema,
  portfolioListSchema,
  portfolioProjectSchema,
  testimonialListSchema,
} from '@/types/admin-content';
import {
  type PriceBookHistory,
  type PriceBookResponse,
  type PriceBookSaveResponse,
  type PutPriceBookBody,
  priceBookHistorySchema,
  priceBookResponseSchema,
  priceBookSaveResponseSchema,
} from '@/types/admin-price-book';
import { type QuoteRevision, quoteRevisionSchema } from '@/types/quote';

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
    // FastAPI's own HTTPException (e.g. 400/413 on uploads) puts the text in a string `detail`.
    typeof body.message === 'string'
      ? body.message
      : typeof body.detail === 'string'
        ? body.detail
        : `Richiesta non riuscita (${response.status}).`,
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

/** The ETag the dossier returned ("v3"), sent back as If-Match on writes. */
function ifMatch(etag: string): Record<string, string> {
  return { 'If-Match': etag };
}

function jsonInit(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

const quote = (projectId: string): string => `/quotes/${encodeURIComponent(projectId)}`;

/** A call whose success answers 204 (no body). */
async function requestVoid(path: string, init: RequestInit): Promise<void> {
  const response = await fetchWithAuth(`${ADMIN_ROOT}${path}`, init);
  if (!response.ok) {
    throw await toError(response);
  }
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

  getRevision: (projectId: string, version: number): Promise<QuoteRevision> =>
    request(`${quote(projectId)}/revisions/${version}`, quoteRevisionSchema),

  /** Fresh 15-minute URL; `attachment` makes the browser save it as PRV-…_foto-1.jpg. */
  getMediaUrl: (
    projectId: string,
    mediaId: string,
    disposition: 'inline' | 'attachment' = 'inline',
  ): Promise<MediaUrlResponse> =>
    request(
      `${quote(projectId)}/media/${encodeURIComponent(mediaId)}/url?disposition=${disposition}`,
      mediaUrlResponseSchema,
    ),

  claim: (projectId: string): Promise<QuoteWriteResponse> =>
    request(`${quote(projectId)}/claim`, quoteWriteResponseSchema, { method: 'POST' }),

  release: (projectId: string): Promise<QuoteWriteResponse> =>
    request(`${quote(projectId)}/release`, quoteWriteResponseSchema, { method: 'POST' }),

  edit: (projectId: string, etag: string, body: EditQuoteBody): Promise<QuoteWriteResponse> =>
    request(quote(projectId), quoteWriteResponseSchema, jsonInit('PATCH', body, ifMatch(etag))),

  approve: (projectId: string, etag: string): Promise<QuoteWriteResponse> =>
    request(`${quote(projectId)}/approve`, quoteWriteResponseSchema, { method: 'POST', headers: ifMatch(etag) }),

  regeneratePdf: (projectId: string): Promise<QuoteWriteResponse> =>
    request(`${quote(projectId)}/pdf`, quoteWriteResponseSchema, { method: 'POST' }),

  reject: (projectId: string, reason: string): Promise<QuoteWriteResponse> =>
    request(`${quote(projectId)}/reject`, quoteWriteResponseSchema, jsonInit('POST', { reason })),

  reopen: (projectId: string, reason: string): Promise<QuoteWriteResponse> =>
    request(`${quote(projectId)}/reopen`, quoteWriteResponseSchema, jsonInit('POST', { reason })),

  sendDefaults: (projectId: string): Promise<SendDefaults> =>
    request(`${quote(projectId)}/send-defaults`, sendDefaultsSchema),

  /** `idempotencyKey` makes a retry of the same send a no-op on the server. */
  send: (projectId: string, body: SendQuoteBody, idempotencyKey: string): Promise<SendQuoteResponse> =>
    request(
      `${quote(projectId)}/send`,
      sendQuoteResponseSchema,
      jsonInit('POST', body, { 'Idempotency-Key': idempotencyKey }),
    ),

  getKpis: (): Promise<AdminKpis> => request('/kpis', adminKpisSchema),

  getPriceBook: (): Promise<PriceBookResponse> => request('/price-book', priceBookResponseSchema),

  /** `etag` is the version the editor read: a save over a newer one answers 409. */
  savePriceBook: (etag: string, body: PutPriceBookBody): Promise<PriceBookSaveResponse> =>
    request('/price-book', priceBookSaveResponseSchema, jsonInit('PUT', body, ifMatch(etag))),

  getPriceBookHistory: (): Promise<PriceBookHistory> =>
    request('/price-book/history', priceBookHistorySchema),

  listTestimonials: (status: TestimonialStatus): Promise<TestimonialList> =>
    request(`/testimonials?status=${status}`, testimonialListSchema),

  moderateTestimonial: (id: string, body: ModerateBody): Promise<ModerateResponse> =>
    request(`/testimonials/${encodeURIComponent(id)}/moderate`, moderateResponseSchema, jsonInit('POST', body)),

  listPortfolio: (): Promise<PortfolioList> => request('/portfolio', portfolioListSchema),

  createPortfolioProject: (body: PortfolioWrite): Promise<PortfolioProject> =>
    request('/portfolio', portfolioProjectSchema, jsonInit('POST', body)),

  updatePortfolioProject: (id: string, body: PortfolioPatch): Promise<PortfolioProject> =>
    request(`/portfolio/${encodeURIComponent(id)}`, portfolioProjectSchema, jsonInit('PATCH', body)),

  deletePortfolioProject: (id: string): Promise<void> =>
    requestVoid(`/portfolio/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** The server checks the file, re-encodes it (WebP, no metadata/GPS) and stores it. */
  uploadPortfolioImage: (file: File): Promise<PortfolioImageUploaded> => {
    const form = new FormData();
    form.append('file', file);
    // No Content-Type: the browser sets the multipart boundary itself.
    return request('/portfolio/image', portfolioImageUploadedSchema, { method: 'POST', body: form });
  },

  getGdprStatus: (): Promise<GdprStatus> => request('/gdpr/status', gdprStatusSchema),

  runGdprLifecycle: (): Promise<GdprRunResult> => request('/gdpr/lifecycle/run', gdprRunResultSchema, { method: 'POST' }),
};
