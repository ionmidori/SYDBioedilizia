/**
 * ReasoningStep Structure
 * Mirrors backend_python/src/models/reasoning.py
 */
export interface ReasoningStep {
    analysis: string;
    action: "call_tool" | "ask_user" | "terminate";
    confidence_score: number;
    risk_score: number;

    // Optional Fields (CoT 2.0)
    criticism?: string;
    intent_category?: "information_retrieval" | "action_execution" | "clarification" | "safety_check";
    tool_name?: string;
    tool_args?: Record<string, any>;
    protocol_status?: "continue" | "pause" | "complete";
}

/**
 * Data Stream Event for Reasoning
 * Protocol Type: '2'
 */
export interface ReasoningEvent {
    type: "reasoning";
    data: ReasoningStep;
}
