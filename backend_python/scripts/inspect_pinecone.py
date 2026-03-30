"""
Inspect Pinecone index: list namespaces, count vectors, and sample records.
Usage: uv run python scripts/inspect_pinecone.py
"""
import os
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.core.config import settings
from pinecone import Pinecone, SearchQuery

def main():
    if not settings.PINECONE_API_KEY:
        print("ERROR: PINECONE_API_KEY not set.")
        return

    pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    
    # 1. List indexes
    print("=" * 80)
    print("PINECONE INDEXES")
    print("=" * 80)
    indexes = pc.list_indexes()
    for idx in indexes:
        print(f"  - {idx.name} (host: {idx.host}, dimension: {idx.dimension}, metric: {idx.metric})")
    
    # 2. Connect to syd-knowledge
    index_name = "syd-knowledge"
    try:
        index = pc.Index(index_name)
    except Exception as e:
        print(f"ERROR connecting to index '{index_name}': {e}")
        return
    
    # 3. Get index stats (namespaces, vector counts)
    print("\n" + "=" * 80)
    print("INDEX STATS")
    print("=" * 80)
    stats = index.describe_index_stats()
    print(f"  Total vectors: {stats.total_vector_count}")
    print(f"  Dimension: {stats.dimension}")
    print(f"  Namespaces:")
    for ns_name, ns_info in stats.namespaces.items():
        print(f"    - '{ns_name}': {ns_info.vector_count} vectors")
    
    # 4. Sample records from each namespace via search
    for ns_name in stats.namespaces.keys():
        print("\n" + "=" * 80)
        print(f"SAMPLE RECORDS from namespace '{ns_name}' (top 3 for query 'ristrutturazione bagno')")
        print("=" * 80)
        
        try:
            # Query the index using the Integrated Inference endpoint (search_records)
            response = index.search_records(
                namespace=ns_name,
                query=SearchQuery(
                    inputs={"text": "ristrutturazione bagno prezzi normative previdenziali"},
                    top_k=3
                )
            )
            # standard python client
            hits = response.get('result', {}).get('hits', []) if isinstance(response, dict) else (getattr(response, 'hits', []) or getattr(getattr(response, 'result', None), 'hits', []))

            for i, hit in enumerate(hits):
                fields_dict = getattr(hit, 'fields', {})
                if not fields_dict and hasattr(hit, 'metadata'):
                    fields_dict = getattr(hit, 'metadata', {})
                if isinstance(fields_dict, dict):
                    pass
                elif hasattr(fields_dict, 'items'):
                    fields_dict = {k: v for k, v in fields_dict.items()}

                score = getattr(hit, 'score', None) or 0.0
                record_id = getattr(hit, 'id', None) or hit.get('_id') if isinstance(hit, dict) else 'N/A'
                if not record_id:
                    record_id = 'N/A'
                chunk_text = fields_dict.get('text', fields_dict.get('chunk_text', 'N/A'))
                source = fields_dict.get('source', fields_dict.get('document', fields_dict.get('categoria', 'Unknown')))
                
                # Expand standard text representation for struct values if any
                if hasattr(chunk_text, 'string_value'):
                    chunk_text = chunk_text.string_value
                if hasattr(source, 'string_value'):
                    source = source.string_value

                preview = str(chunk_text)[:500]
                
                print(f"\n  [{i+1}] ID: {record_id}")
                print(f"      Score: {score:.4f} | Source/Category: {source}")
                print(f"      Text preview ({len(str(chunk_text))} chars):")
                print(f"      {preview}")
                print("      " + "-" * 70)
        except Exception as e:
            print(f"  ERROR querying namespace '{ns_name}': {e}")


if __name__ == "__main__":
    main()
