"""
Context builder utility for AI prompt generation.

This module provides helper functions to fetch and format project details
into natural language context for LLM system prompts.
"""
import logging
from src.db import projects as projects_db

logger = logging.getLogger(__name__)


async def build_system_prompt_context(session_id: str, user_id: str) -> str:
    """
    Build AI system prompt context from project construction details.
    
    Fetches project details from Firestore and formats them into natural
    language that can be injected into the system prompt for contextual
    AI assistance.
    
    Args:
        session_id: Project/Session ID.
        user_id: User ID for ownership verification.
    
    Returns:
        Formatted context string. Empty string if no details are set.
    
    Example output:
        "The user is renovating a villa of 120sqm located at Via Roma 10, Milan 20100.
        The budget cap is €50,000. Technical notes: Load-bearing wall on north side.
        Renovation constraints: Historical building regulations, Cannot modify facade."
    """
    try:
        # Fetch project document
        project = await projects_db.get_project(session_id, user_id)
        
        if not project or not project.construction_details:
            logger.debug(f"[ContextBuilder] No construction details found for project {session_id}")
            return ""
        
        details = project.construction_details
        
        # Build natural language context
        context_parts = []
        
        # Property overview
        property_type_labels = {
            "apartment": "un appartamento",
            "villa": "una villa",
            "commercial": "un immobile commerciale"
        }
        property_label = property_type_labels.get(details.property_type.value, "un immobile")
        
        context_parts.append(
            f"L'utente sta ristrutturando {property_label} di {details.footage_sqm}mq "
            f"situato in {details.address.street}, {details.address.city} {details.address.zip}."
        )
        
        # Budget information
        context_parts.append(f"Il budget massimo è di €{details.budget_cap:,.0f}.")
        
        # Technical notes
        if details.technical_notes:
            context_parts.append(f"Note tecniche: {details.technical_notes}")
        
        # Renovation constraints
        if details.renovation_constraints:
            constraints_str = ", ".join(details.renovation_constraints)
            context_parts.append(f"Vincoli di ristrutturazione: {constraints_str}.")
        
        full_context = " ".join(context_parts)
        logger.info(f"[ContextBuilder] Built context for project {session_id}: {len(full_context)} chars")
        
        return full_context
        
    except Exception as e:
        logger.error(f"[ContextBuilder] Error building context for {session_id}: {str(e)}", exc_info=True)
        return ""
