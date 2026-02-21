/**
 * Quote System Types — Golden Sync with backend_python/src/schemas/quote.py
 *
 * IMPORTANT: Any changes here MUST be reflected in the Pydantic models.
 * See: backend_python/src/schemas/quote.py (QuoteItem, QuoteFinancials, QuoteSchema)
 */

// ─── Status Lifecycle ──────────────────────────────────────────────────────────
// draft → pending_review → approved → sent
//                        → rejected

export type QuoteStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected';

// ─── Core Models ───────────────────────────────────────────────────────────────

export interface QuoteItem {
  sku: string;
  description: string;
  unit: string;           // mq, cad, m, mc, etc.
  qty: number;
  unit_price: number;
  total: number;          // qty * unit_price
  ai_reasoning?: string;  // Why the AI suggested this item
  category?: string;      // e.g., "Demolizioni", "Impianto Elettrico"
  manual_override: boolean;
}

export interface QuoteFinancials {
  subtotal: number;
  vat_rate: number;       // Default 0.22 (22% IVA)
  vat_amount: number;
  grand_total: number;
}

export interface Quote {
  id?: string;
  project_id: string;
  user_id: string;
  status: QuoteStatus;
  items: QuoteItem[];
  financials: QuoteFinancials;
  admin_notes?: string;
  created_at: string;     // ISO 8601
  updated_at: string;     // ISO 8601
  version: number;
}

// ─── API Request/Response Types ────────────────────────────────────────────────

export interface QuoteListItem {
  project_id: string;
  status: QuoteStatus;
  grand_total: number;
  item_count: number;
  updated_at: string;
}

export interface QuoteUpdateRequest {
  items?: QuoteItem[];
  admin_notes?: string;
}

export interface AdminDecision {
  decision: 'approve' | 'reject' | 'edit';
  notes?: string;
}
