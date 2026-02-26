/**
 * ReasoningStep Structure
 * Mirrors backend_python/src/models/reasoning.py (Golden Sync)
 *
 * MANDATORY: Any field added/removed here MUST be reflected in the backend model.
 */
export interface ReasoningStep {
    /** Concise internal reasoning about user intent and state. Max 500 chars. */
    analysis: string;
    /** The determined next step based on the analysis. */
    action: "call_tool" | "ask_user" | "terminate";
    /** 0.0 to 1.0 score indicating certainty in the action. */
    confidence_score: number;
    /** 0.0 (safe) to 1.0 (critical). Irreversibility assessment. */
    risk_score: number;

    // ── Core Tool Fields ──────────────────────────────────────────
    /** The exact name of the tool to call (must be in the allowed list). */
    tool_name?: string;
    /** Arguments for the tool call. Must be a valid dictionary. */
    tool_args?: Record<string, unknown>;
    /** Specific data point being extracted or processed. */
    target_data?: string;

    // ── CoT 2.0 Advanced Cognition ────────────────────────────────
    /** Current status of the protocol sequence. */
    protocol_status?: "continue" | "pause" | "complete";
    /** List of specific information pieces currently missing. */
    missing_info?: string[];
    /** Constructive self-criticism — required if action is 'call_tool'. */
    criticism?: string;
    /**
     * High-level categorization of the user's intent.
     * NOTE: backend uses 'data_collection' — ensure new categories are mirrored.
     */
    intent_category?:
    | "information_retrieval"
    | "data_collection"
    | "action_execution"
    | "clarification"
    | "safety_check";
}

/**
 * Data Stream Event for Reasoning
 * Protocol Type: '2'
 */
export interface ReasoningEvent {
    type: "reasoning";
    data: ReasoningStep;
}
