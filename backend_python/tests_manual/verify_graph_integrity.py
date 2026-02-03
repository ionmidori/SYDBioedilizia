import sys
import os

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

try:
    from src.graph.agent import get_agent_graph
    print("Attempting to initialize graph...")
    graph = get_agent_graph()
    print("✅ Graph initialized successfully!")
except Exception as e:
    print(f"❌ Failed to initialize graph: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
