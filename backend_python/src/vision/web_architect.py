import base64
import json
import logging
from typing import List, Optional
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field
from src.core.config import settings

logger = logging.getLogger(__name__)

class WebComponent(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(..., description="Shadcn/UI component name (e.g., Button, Card, DataTable)")
    purpose: str = Field(..., description="What this component does in the UI")
    styling_suggestions: List[str] = Field(default_factory=list, description="Tailwind CSS classes or glassmorphism tips")

class WebMockupAnalysis(BaseModel):
    """
    Structured analysis of a web mockup for Antigravity Creative Studio.
    """
    model_config = {"extra": "forbid"}
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
    """
    model_name = "gemini-2.5-flash"
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
        client = genai.Client(api_key=settings.api_key)
        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[genai_types.Content(parts=[
                genai_types.Part(text=system_prompt),
                genai_types.Part(inline_data=genai_types.Blob(
                    mime_type=mime_type,
                    data=base64_image,
                )),
            ])],
            config=genai_types.GenerateContentConfig(temperature=0.2),
        )

        raw_output = response.text or ""
        cleaned_output = raw_output.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned_output)
        return WebMockupAnalysis(**parsed)

    except Exception as e:
        logger.error(f"[WebArchitect] Analysis failed: {e}")
        raise ValueError(f"Web mockup analysis failed: {str(e)}")
