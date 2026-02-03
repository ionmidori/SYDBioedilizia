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
        description="Concise internal reasoning about user intent and state. MAX 500 characters.",
        max_length=500
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

    # 🔥 CoT ENHANCEMENT: Explicit Protocol Validation
    protocol_status: Literal["continue", "pause", "complete"] = Field(
        default="continue",
        description="Current status of the protocol sequence (e.g., pause if interruptions occur)."
    )
    
    missing_info: List[str] = Field(
        default_factory=list,
        description="List of specific information pieces currently missing (e.g., ['lighting_preferences', 'budget'])."
    )
    
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 🛡️ PYTHON GUARDRAILS (The "Muscle")
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    @field_validator('tool_name')
    @classmethod
    def validate_tool_access(cls, v: Optional[str]) -> Optional[str]:
        """
        Prevents LLM hallucinations by strictly validating tool names against an allowed list.
        Auto-corrects common aliases.
        """
        if v is None:
            return v
            
        # 1. AUTO-CORRECTION / ALIAS MAPPING
        aliases = {
            # Rendering
            "create_rendering": "generate_render",
            "render_room": "generate_render",
            "make_render": "generate_render",
            "generate_image": "generate_render",
            "create_image": "generate_render",
            "visualize_room": "generate_render",
            
            # Analysis
            "scan_room": "analyze_room",
            "check_room": "analyze_room",
            "describe_room": "analyze_room",
            "analyze_image": "analyze_room",
            
            # Leads / Projects
            "create_quote": "submit_lead",
            "save_lead": "submit_lead",
            "create_project": "submit_lead",
            "save_project": "submit_lead",
            
            # Pricing
            "check_prices": "get_market_prices",
            "estimate_costs": "get_market_prices",
            
            # Files
            "show_files": "list_project_files",
            "list_files": "list_project_files",
            "show_gallery": "list_project_files" 
        }
        
        if v in aliases:
            return aliases[v]
            
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
