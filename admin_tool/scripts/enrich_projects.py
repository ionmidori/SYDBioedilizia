"""
Utility script to enrich Firestore project documents with sample data for UAT.

Skill: building-admin-dashboards — §Firebase Firestore Integration
Skill: error-handling-patterns — §Robust Utility Scripts
"""
import logging
import sys
import os
from typing import Dict, Any

# Add the project root to sys.path so we can import from src
# When running from admin_tool/scripts/, the parent is admin_tool/
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from src.db.quote_repo import QuoteRepository
    from src.db.firebase_init import get_db
except ImportError:
    # Fallback for different execution contexts
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    from admin_tool.src.db.quote_repo import QuoteRepository
    from admin_tool.src.db.firebase_init import get_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("enrich_projects")

def enrich_projects():
    """
    Iterates through all projects and adds missing UAT metadata.
    """
    logger.info("Starting project enrichment process...")
    repo = QuoteRepository()
    db = get_db()
    
    try:
        projects_ref = db.collection("projects")
        projects = projects_ref.stream()
        
        count = 0
        for project_doc in projects:
            data = project_doc.to_dict() or {}
            updates: Dict[str, Any] = {}
            
            # Patch client_name
            if not data.get("client_name") and not data.get("name"):
                updates["client_name"] = "Mario Rossi (UAT)"
                updates["name"] = f"Progetto UAT - {project_doc.id[:5]}"
            
            # Patch client_email
            if not data.get("client_email") and not data.get("email"):
                updates["client_email"] = "test-uat@sydbioedilizia.it"
                
            # Patch address
            if not data.get("address"):
                updates["address"] = "Via Roma 1, 00100 Roma (RM)"
                
            if updates:
                logger.info(f"Enriching project {project_doc.id} with: {updates}")
                repo.update_project(project_doc.id, updates)
                count += 1
                
        logger.info(f"Successfully enriched {count} projects.")
    except Exception as e:
        logger.error(f"Enrichment failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    enrich_projects()
