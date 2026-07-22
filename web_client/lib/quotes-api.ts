import { fetchValidated } from '@/lib/api-client';
import {
  QuoteListItem,
  QuotePdfUrl,
  quoteListResponseSchema,
  quotePdfUrlSchema,
} from '@/types/quote';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

export const quotesApi = {
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
};
