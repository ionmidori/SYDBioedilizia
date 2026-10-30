import { describeApiError, fetchValidated, fetchWithAuth } from '@/lib/api-client';
import {
  Quote,
  QuoteListItem,
  QuotePdfUrl,
  QuoteSubmitResponse,
  quoteListResponseSchema,
  quotePdfUrlSchema,
  quoteSchema,
  quoteSubmitResponseSchema,
} from '@/types/quote';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

export const quotesApi = {
  /**
   * The quote of the house (the user's chat, Phase 139), as the client may see
   * it: prices are hidden until the admin approves it. `null` while there is no
   * quote yet (404 — FastAPI's body carries no status, so the response's is read).
   */
  getQuote: async (projectId: string): Promise<Quote | null> => {
    const response = await fetchWithAuth(`${API_ROOT}/quote/${encodeURIComponent(projectId)}`);
    if (response.status === 404) return null;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(describeApiError(body));
    return quoteSchema.parse(body);
  },

  /**
   * Lists all quotes for a user (client area "Preventivi" section).
   * The backend masks grand_total until the quote is approved by the admin.
   */
  listUserQuotes: async (userId: string): Promise<QuoteListItem[]> => {
    return fetchValidated(
      `${API_ROOT}/quote/user/${encodeURIComponent(userId)}`,
      quoteListResponseSchema
    );
  },

  /**
   * Gets a fresh short-lived signed URL (15 min) for the approved quote PDF.
   * The backend returns 404 until the admin has approved the quote.
   */
  getQuotePdfUrl: async (projectId: string): Promise<QuotePdfUrl> => {
    return fetchValidated(
      `${API_ROOT}/quote/${encodeURIComponent(projectId)}/pdf`,
      quotePdfUrlSchema
    );
  },

  /**
   * Sends the project's quote draft to the team (draft → pending_review, admin
   * notified by email). Reuse the same `idempotencyKey` when retrying the same
   * click: the backend answers like the first request and sends no second email.
   */
  submitQuote: async (projectId: string, idempotencyKey: string): Promise<QuoteSubmitResponse> => {
    return fetchValidated(
      `${API_ROOT}/quote/${encodeURIComponent(projectId)}/submit`,
      quoteSubmitResponseSchema,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }
    );
  },
};
