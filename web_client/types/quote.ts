/**
 * Quote Types — Golden Sync with backend_python/src/schemas/quote.py
 *
 * ⚠️ DO NOT EDIT MANUALLY. Kept in sync with QuoteSchema, QuoteItem, QuoteFinancials.
 * Update both files whenever the Pydantic models change.
 *
 * Status lifecycle (matches backend):
 *   draft → pending_review → approved → sent | rejected
 */

import { z } from "zod";

// ── Enums & Literals ─────────────────────────────────────────────────────────

export type QuoteStatus =
    | "draft"
    | "pending_review"
    | "approved"
    | "sent"
    | "rejected";

// ── Core Interfaces ──────────────────────────────────────────────────────────

/** Single line-item in a quote. Mirrors QuoteItem Pydantic model. */
export interface QuoteItem {
    /** SKU from Master Price Book */
    sku: string;
    /** Human-readable description */
    description: string;
    /** Unit of measure (mq, cad, m, etc.) */
    unit: string;
    /** Quantity to execute */
    qty: number;
    /** Price per unit in EUR */
    unit_price: number;
    /** Total = qty × unit_price */
    total: number;
    /** AI explanation for why this item was included */
    ai_reasoning?: string | null;
    /** Category (e.g. Demolizioni, Impianto Elettrico) */
    category?: string | null;
    /**
     * WBS Phase — matches renovation_assemblies.json phase names.
     * One of: Demolizioni | Impianti | Opere Murarie | Strutture | Finiture | Smaltimento
     */
    phase?: string;
    /** True if admin has manually overridden AI suggestion */
    manual_override: boolean;
}

/** Financial summary for a quote. Mirrors QuoteFinancials Pydantic model. */
export interface QuoteFinancials {
    subtotal: number;
    vat_rate: number;
    vat_amount: number;
    grand_total: number;
}

/** Full quote document. Mirrors QuoteSchema Pydantic model. */
export interface QuoteSchema {
    /** Firestore document ID */
    id?: string | null;
    project_id: string;
    user_id: string;
    status: QuoteStatus;
    items: QuoteItem[];
    financials: QuoteFinancials;
    admin_notes?: string | null;
    created_at: string; // ISO 8601
    updated_at: string; // ISO 8601
    version: number;
}

// ── API Request/Response Types ───────────────────────────────────────────────

/** Response for GET /quote/user/{user_id} list endpoint */
export interface QuoteListItem {
    project_id: string;
    status: QuoteStatus;
    grand_total: number;
    item_count: number;
    updated_at: string;
}

/** Request body for PATCH /quote/{project_id} */
export interface QuoteUpdateBody {
    items?: QuoteItem[];
    admin_notes?: string;
}

/** Request body for POST /quote/{project_id}/approve */
export interface AdminDecisionBody {
    decision: "approve" | "reject" | "edit";
    notes?: string;
}

/** Response for POST /quote/{project_id}/start */
export interface StartQuoteResponse {
    status: "awaiting_admin_review";
    project_id: string;
    message: string;
}

/** Response for POST /quote/{project_id}/approve */
export interface ApproveQuoteResponse {
    status: string;
    project_id: string;
    decision: "approve" | "reject" | "edit";
}

/** Response for GET /quote/{project_id}/pdf */
export interface QuotePdfUrlResponse {
    pdf_url: string;
    expires_in_seconds: number;
}

// ── InsightAnalysis — mirrors insight_engine.py models ───────────────────────

/** WBS suggestion from the Assembly Engine. Mirrors SKUItemSuggestion Pydantic model. */
export interface SKUItemSuggestion {
    sku: string;
    qty: number;
    ai_reasoning: string;
    /** WBS Phase: Demolizioni | Impianti | Opere Murarie | Strutture | Finiture | Smaltimento */
    phase: string;
}

/**
 * Structured AI analysis — mirrors InsightAnalysis Pydantic model.
 *
 * completeness_score thresholds:
 *   >= 0.85  Reliable estimate, proceed to pricing
 *    0.70-0.85  Indicative — add disclaimer
 *   < 0.70  Insufficient — chatbot must ask missing_info questions before quoting
 */
export interface InsightAnalysis {
    suggestions: SKUItemSuggestion[];
    summary: string;
    completeness_score: number;
    /** Italian questions to ask when completeness_score < 0.70 */
    missing_info: string[];
}

// ── Zod Validation Schemas ───────────────────────────────────────────────────
// These validate API responses at runtime. Use in fetch wrappers.

export const QuoteItemSchema = z.object({
    sku: z.string().min(1),
    description: z.string().min(1),
    unit: z.string().min(1),
    qty: z.number().nonnegative(),
    unit_price: z.number().nonnegative(),
    total: z.number().nonnegative(),
    ai_reasoning: z.string().nullish(),
    category: z.string().nullish(),
    phase: z.string().optional(),
    manual_override: z.boolean(),
});

export const QuoteFinancialsSchema = z.object({
    subtotal: z.number(),
    vat_rate: z.number(),
    vat_amount: z.number(),
    grand_total: z.number(),
});

export const QuoteStatusSchema = z.enum([
    "draft",
    "pending_review",
    "approved",
    "sent",
    "rejected",
]);

export const QuoteSchemaValidator = z.object({
    id: z.string().optional().nullable(),
    project_id: z.string(),
    user_id: z.string(),
    status: QuoteStatusSchema,
    items: z.array(QuoteItemSchema),
    financials: QuoteFinancialsSchema,
    admin_notes: z.string().optional().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    version: z.number().int().positive(),
});

export const QuoteListItemSchema = z.object({
    project_id: z.string(),
    status: QuoteStatusSchema,
    grand_total: z.number(),
    item_count: z.number().int(),
    updated_at: z.string(),
});

export const SKUItemSuggestionSchema = z.object({
    sku: z.string(),
    qty: z.number().positive(),
    ai_reasoning: z.string(),
    phase: z.string(),
});

export const InsightAnalysisSchema = z.object({
    suggestions: z.array(SKUItemSuggestionSchema),
    summary: z.string(),
    completeness_score: z.number().min(0).max(1),
    missing_info: z.array(z.string()),
});
