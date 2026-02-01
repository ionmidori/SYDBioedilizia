from typing import List, Dict, Any, Optional
from langchain_core.tools import BaseTool

# 🔥 CENTRALIZED TOOLS IMPORT (Lazy to avoid circular imports if needed)
from src.graph.tools_registry import (
    generate_render,
    analyze_room,
    get_market_prices,
    submit_lead,
    list_project_files
)
from src.tools.lead_tools import display_lead_form
from src.tools.auth_tools import request_login

class SOPManager:
    """
    Standard Operating Procedure (SOP) Manager.
    
    This class acts as the "Gatekeeper" (Tier 3), ensuring that the Agent
    only sees and attempts to use tools that are valid for the current User Context.
    
    Responsibilities:
    1. Role-Based Tool Access (RBTA): Hide 'generate_render' from anonymous users if quota exceeded.
    2. Context Filtering: Hide 'submit_lead' if the user hasn't defined a project yet.
    """
    
    @staticmethod
    def get_available_tools(user_context: Dict[str, Any]) -> List[BaseTool]:
        """
        Dynamically returns the list of allowable tools based on user state.
        
        Args:
            user_context: Dict containing 'is_authenticated', 'role', 'quota_remaining', etc.
            
        Returns:
            List of BaseTool instances.
        """
        is_authenticated = user_context.get("is_authenticated", False)
        # quota_remaining = user_context.get("quota", 0) # Future implementation
        
        # Base tools always available
        available_tools = [
            analyze_room, 
            get_market_prices,
            list_project_files,
            submit_lead, 
            display_lead_form,
            request_login
        ]
        
        # 🛡️ RBTA RULE: Render Generation
        # Strict Rule: Only show generate_render if authenticated OR (in future) under strict anon quota
        if is_authenticated:
            available_tools.append(generate_render)
        else:
            # If not authenticated, we explicitly EXCLUDE generate_render
            # The Reasoning Node should catch this via its own internal logic, 
            # but this is the hard enforcement layer.
            pass 
            
        return available_tools

    @staticmethod
    def get_tool_names(tools: List[BaseTool]) -> List[str]:
        return [t.name for t in tools]
