/**
 * API Contract Types — Golden Sync
 *
 * These interfaces MUST stay in 1:1 parity with the Pydantic models in
 * backend_python/main.py. When updating backend models, update these too.
 *
 * Backend source: backend_python/main.py
 *   - LeadSubmissionRequest (line ~176)
 *   - ChatMessage           (line ~212)
 *   - ChatRequest           (line ~226)
 */

// ─── Lead Submission ─────────────────────────────────────────────────────────

/**
 * POST /api/submit-lead
 * Mirrors: LeadSubmissionRequest (backend_python/main.py)
 */
export interface LeadSubmissionRequest {
  name: string;          // min 1, max 200
  email: string;         // max 320, validated email format
  phone?: string;        // max 30
  quote_summary: string; // min 1, max 5000 — NOTE: mapped to project_details in tool
  session_id: string;    // min 1, max 128, pattern: ^[a-zA-Z0-9_-]+$
}

// ─── Chat ────────────────────────────────────────────────────────────────────

/**
 * Single message in a ChatRequest.
 * Mirrors: ChatMessage (backend_python/main.py)
 *
 * Note: the backend accepts `content` as string OR list (multi-part).
 * The frontend always sends string content.
 */
export interface ChatMessageRequest {
  role: 'user' | 'assistant' | 'system';
  content: string | unknown[]; // string max 50000 chars, list max 20 parts
}

/**
 * POST /chat/stream
 * Mirrors: ChatRequest (backend_python/main.py)
 *
 * Field names use camelCase (aliased from snake_case in the Pydantic model).
 */
export interface ChatRequest {
  messages: ChatMessageRequest[];    // max 100
  sessionId: string;                 // min 1, max 128, pattern: ^[a-zA-Z0-9_-]+$
  mediaUrls?: string[];
  imageUrls?: string[];              // backward compat alias for mediaUrls
  mediaTypes?: string[];
  mediaMetadata?: Record<string, Record<string, unknown>>;
  videoFileUris?: string[];
  projectId?: string;                // max 128, pattern: ^[a-zA-Z0-9_-]+$
  is_authenticated?: boolean;        // defaults to false
}

// ─── Standard API Responses ──────────────────────────────────────────────────

/**
 * Standard error envelope.
 * Mirrors: APIErrorResponse (backend_python/src/core/schemas.py)
 */
export interface APIErrorResponse {
  error_code: string;
  message: string;
  detail?: Record<string, unknown>;
  request_id: string;
}
