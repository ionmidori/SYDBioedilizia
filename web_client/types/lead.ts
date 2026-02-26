/**
 * Lead Data Types
 * Golden Sync: mirrors backend_python/src/models/lead.py
 *
 * Backend models:
 *   - LeadData       → base customer data (no uid/session_id)
 *   - LeadDocument   → full Firestore document (extends LeadData, adds uid/session_id/metadata)
 *
 * MANDATORY: Any changes here MUST be reflected in backend_python/src/models/lead.py.
 */

/** Mirrors LeadData (backend_python/src/models/lead.py) */
export interface LeadData {
    name: string;
    email: string;
    phone?: string;
    project_details: string; // Mapped from quote_summary in the UI
    room_type?: string;      // Optional enrichment
    style?: string;          // Optional enrichment
}

/**
 * Mirrors LeadDocument (backend_python/src/models/lead.py)
 * Full Firestore document — includes uid, session_id and metadata.
 */
export interface LeadDocument extends LeadData {
    uid: string;
    session_id: string;      // Required for context tracking
    created_at: string;      // ISO 8601
    source: string;          // e.g. "chat"
}

export interface LeadSubmissionResponse {
    status: 'success' | 'error';
    message: string;
    request_id?: string;
}
