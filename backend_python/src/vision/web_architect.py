import os
import json
import logging
from typing import List, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from src.core.config import settings

logger = logging.getLogger(__name__)

class WebComponent(BaseModel):
    name: str = Field(..., description="Shadcn/UI component name (e.g., Button, Card, DataTable)")
    purpose: str = Field(..., description="What this component does in the UI")
    styling_suggestions: List[str] = Field(default_factory=list, description="Tailwind CSS classes or glassmorphism tips")

class WebMockupAnalysis(BaseModel):
    """
    Structured analysis of a web mockup for Antigravity Creative Studio.
    """
    layout_type: str = Field(..., description="Bento Grid, Sidebar + Content, Multi-column, etc.")
    color_palette: List[str] = Field(..., description="Primary hex codes and semantic roles")
    typography_suggested: str = Field(..., description="Font pairings (Serif/Sans pairings)")
    components_identified: List[WebComponent] = Field(default_factory=list)
    visual_style_notes: str = Field(..., description="Glassmorphism, Flat, Brutalist, etc.")
    tailwind_globals: List[str] = Field(default_factory=list, description="Suggested configuration for tailwind.config.js")

async def analyze_web_mockup(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
    user_context: str = ""
) -> WebMockupAnalysis:
    """
    Analyzes a web design mockup and translates it into Shadcn/UI and Tailwind specifications.
    
    Args:
        image_bytes: The source image/mockup as bytes
        mime_type: MIME type of the image
        user_context: Additional instructions (e.g., "Make it look like Apple's dashboard")
        
    Returns:
        WebMockupAnalysis structured object
    """
    model_name = "gemini-3-flash-preview"
    
    logger.info(f"[WebArchitect] Analyzing mockup with {model_name}...")
    
    system_prompt = f"""
    ROLE: You are a Senior UI/UX Engineer specializing in Shadcn/UI and Tailwind CSS.
    
    GOAL: Analyze the attached web design mockup and provide a structured implementation plan.
    
    CONTEXT: {user_context}
    
    YOUR TASK:
    1. Identify the high-level layout (e.g., Bento Grid).
    2. Map visual elements to specific Shadcn/UI components.
    3. Extract the color palette and typography.
    4. Suggest Tailwind CSS classes to achieve the "look and feel" (e.g., glassmorphism, gradients).
    
    RESPOND WITH ONLY VALID JSON:
    {{
      "layout_type": "...",
      "color_palette": ["#...", "#..."],
      "typography_suggested": "...",
      "components_identified": [
        {{ "name": "Card", "purpose": "Hero stat", "styling_suggestions": ["bg-white/5", "backdrop-blur-xl"] }}
      ],
      "visual_style_notes": "...",
      "tailwind_globals": ["primary: #...", "border: #..."]
    }}
    """
    
    try:
        llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=settings.api_key,
            temperature=0.2
        )
        
        import base64
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        
        from langchain_core.messages import HumanMessage
        
        message = HumanMessage(
            content=[
                {"type": "text", "text": system_prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                }
            ]
        )
        
        response = await llm.ainvoke([message])
        raw_output = response.content
        
        # Robust JSON cleaning
        cleaned_output = raw_output.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned_output)
        
        return WebMockupAnalysis(**parsed)
        
    except Exception as e:
        logger.error(f"[WebArchitect] Analysis failed: {e}")
        raise ValueError(f"Web mockup analysis failed: {str(e)}")
