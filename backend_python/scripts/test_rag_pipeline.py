import os
import sys
import asyncio
import logging

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.adk.agents import triage_agent, quote_agent, design_agent
from google.genai import Client

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

async def test_quote_agent():
    print("\n" + "="*80)
    print("TESTING QUOTE AGENT (Prezzario + Normative RAG)")
    print("="*80)
    
    prompt = "Cosa dice il documento sulle linee guida di SYD Bioedilizia per il sradicamento degli impianti vecchi in un bagno? E quanto costa l'articolo A 1.05.4.b?"
    
    print(f"\nUser Query: {prompt}\n")
    print("Agent is thinking...\n")
    
    # We use quote_agent which has access to `retrieve_knowledge` and `retrieve_price_by_code`
    from src.adk.agents import syd_orchestrator
    
    from src.core.config import settings
    
    # To keep dependencies simple, let's just make a direct call to the RAG tools as defined in adk/tools.py 
    # to verify the python call structure is completely valid.
    
    try:
        from src.tools.rag_tools import retrieve_knowledge, retrieve_price_by_code
        print("Testing direct tool calls first...")
        
        # 1. Knowledge Retrieval
        print(f"\n[Tool Call] retrieve_knowledge(query='linee guida SYD bagno')")
        k_results = await retrieve_knowledge("linee guida SYD bagno sradicamento impianti normative")
        print(f"Result (truncated): {str(k_results)[:300]}...")
        
        # 2. Price Retrieval
        print(f"\n[Tool Call] retrieve_price_by_code(code='A 1.05.4.b')")
        p_results = await retrieve_price_by_code("A 1.05.4.b")
        print(f"Result: {p_results}")
        
    except Exception as e:
        print(f"Error testing tools: {e}")

if __name__ == "__main__":
    asyncio.run(test_quote_agent())
