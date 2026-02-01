from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional, List

class ReasoningStep(BaseModel):
    """
    Structured Output Model for the Agent's Chain of Thought (CoT).
    
    This model enforces "Fail-Fast" logic:
    - If the LLM hallucinates a tool, Pydantic raises ValidationError.
    - If the analysis is too long, it raises ValidationError.
    - If security risks are detected in `target_data`, it halts execution.
    """
    
    analysis: str = Field(
        ..., 
        description="Concise internal reasoning about user intent and state. MAX 200 characters.",
        max_length=200
    )
    
    action: Literal["call_tool", "ask_user", "terminate"] = Field(
        ...,
        description="The determined next step based on the analysis."
    )
    
    tool_name: Optional[str] = Field(
        None,
        description="The exact name of the tool to call (must be enabled)."
    )
    
    tool_args: Optional[dict] = Field(
        None,
        description="Arguments for the tool call. MUST be a valid dictionary."
    )
    
    target_data: Optional[str] = Field(
        None,
        description="Specific data point being extracted or processed (e.g., 'image_url')."
    )
    
    confidence_score: float = Field(
        ...,
        description="0.0 to 1.0 score indicating certainty in the action.",
        ge=0.0,
        le=1.0
    )
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🛡️ PYTHON GUARDRAILS (The "Muscle")
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    @field_validator('tool_name')
    @classmethod
    def validate_tool_access(cls, v: Optional[str]) -> Optional[str]:
        """
        Prevents LLM hallucinations by strictly validating tool names against an allowed list.
        """
        if v is None:
            return v
            
        # ALLOWED TOOLS (Source of Truth)
        # TODO: In Tier-3 optimization, this list should be dynamic based on User Role (RBTA)
        ALLOWED_TOOLS = {
            "generate_render",
            "analyze_room",
            "analyze_media_triage",
            "get_market_prices",
            "submit_lead",
            "submit_lead_data",
            "display_lead_form",
            "list_project_files",
            "request_login",
            "show_project_gallery",
            "plan_renovation", 
            "save_quote"
        }
        
        if v not in ALLOWED_TOOLS:
            # We raise a ValueError which will cause the "Fail-Fast" mechanism to trigger
            raise ValueError(f"Tool '{v}' is either invalid, deprecated, or restricted.")
            
        return v
    
    @field_validator('target_data')
    @classmethod
    def security_scan(cls, v: Optional[str]) -> Optional[str]:
        """
        Basic Input Sanitization Scanner.
        Detects potential injection attacks or malicious payloads in reasoning data.
        """
        if not v:
            return v
            
        risk_patterns = ["<script>", "javascript:", "DROP TABLE", "DELETE FROM", "exec("]
        
        if any(pattern in v for pattern in risk_patterns):
            raise ValueError("Security Risk: Malicious input pattern detected in target_data.")
            
        return v
