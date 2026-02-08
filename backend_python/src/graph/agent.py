import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from src.core.config import settings
from src.graph.tools_registry import ALL_TOOLS
from src.graph.factory import AgentGraphFactory

logger = logging.getLogger(__name__)

# LLM Lazy Loaders
_llm = None
_reasoning_llm = None

def _get_llm():
    """Lazy-load Execution LLM instance (Gemini 2.5/3.0 Flash)."""
    global _llm
    if _llm is None:
        logger.info("⚡ Initializing Execution LLM...")
        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", 
            google_api_key=settings.api_key,
            temperature=0.1,
        )
    return _llm

def _get_reasoning_llm():
    """Lazy-load Reasoning LLM instance (Gemini 2.0 Flash)."""
    global _reasoning_llm
    if _reasoning_llm is None:
        logger.info("🧠 Initializing Reasoning LLM...")
        _reasoning_llm = ChatGoogleGenerativeAI(
            # Using Flash for reasoning speed
            model="gemini-2.0-flash", 
            google_api_key=settings.api_key,
            temperature=0.0, # Strict Logic
        )
    return _reasoning_llm

# Singleton Graph Instance
_agent_graph = None

def get_agent_graph():
    """
    Lazy loads the agent graph. 
    Act as the Composition Root for the Agent subsystem.
    """
    global _agent_graph
    
    if _agent_graph is None:
        logger.info("🏭 Construction: Building Agent Graph via Factory...")
        
        # 1. Instantiate Dependencies
        llm = _get_llm()
        reasoning_llm = _get_reasoning_llm()
        tools = ALL_TOOLS
        
        # 2. Create Factory
        factory = AgentGraphFactory(
            llm=llm, 
            reasoning_llm=reasoning_llm, 
            tools=tools
        )
        
        # 3. Compile Graph
        _agent_graph = factory.create_graph()
        logger.info("✅ Agent Graph Successfully Initialized")
        
    return _agent_graph
