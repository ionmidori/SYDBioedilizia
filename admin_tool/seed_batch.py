import sys
import os
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from src.db.firebase_init import get_db

db = get_db()
batch_id = f"batch_{str(uuid.uuid4())[:8]}"
project_id_1 = f"proj_{str(uuid.uuid4())[:8]}"
project_id_2 = f"proj_{str(uuid.uuid4())[:8]}"

# Create fake projects first
db.collection("projects").document(project_id_1).set({
    "name": "Test Batch Project 1",
    "client_name": "Mario Rossi",
    "client_email": "mario@example.com",
    "address": "Via Roma 1",
    "userId": "test_user_123",
    "created_at": datetime.now(timezone.utc)
})
# And their quotes
db.collection("projects").document(project_id_1).collection("private_data").document("quote").set({
    "status": "pending_review",
    "financials": {"subtotal": 1000.0, "grand_total": 1220.0},
    "items": [{"name": "Posa Pavimenti", "total": 1000.0}],
    "created_at": datetime.now(timezone.utc)
})

db.collection("projects").document(project_id_2).set({
    "name": "Test Batch Project 2",
    "client_name": "Luigi Verdi",
    "client_email": "luigi@example.com",
    "address": "Via Milano 2",
    "userId": "test_user_123",
    "created_at": datetime.now(timezone.utc)
})
db.collection("projects").document(project_id_2).collection("private_data").document("quote").set({
    "status": "pending_review",
    "financials": {"subtotal": 2000.0, "grand_total": 2440.0},
    "items": [{"name": "Posa Rivestimenti", "total": 2000.0}],
    "created_at": datetime.now(timezone.utc)
})

# Create the batch
batch_data = {
    "user_id": "test_user_123",
    "status": "submitted",
    "projects": [
        {
            "project_id": project_id_1,
            "project_name": "Test Batch Project 1",
            "status": "pending_review",
            "item_count": 1,
            "subtotal": 1000.0
        },
        {
            "project_id": project_id_2,
            "project_name": "Test Batch Project 2",
            "status": "pending_review",
            "item_count": 1,
            "subtotal": 2000.0
        }
    ],
    "total_projects": 2,
    "batch_subtotal": 3000.0,
    "batch_grand_total": 3660.0,
    "potential_savings": 150.0,
    "aggregation_preview": [
        {"rationale": "Sconto logistica unificata", "saving_amount": 150.0}
    ],
    "submitted_at": datetime.now(timezone.utc),
    "created_at": datetime.now(timezone.utc),
    "updated_at": datetime.now(timezone.utc),
}

db.collection("quote_batches").document(batch_id).set(batch_data)
print(f"✅ Batch seeded successfully with ID: {batch_id}")
print(f"   Project 1: {project_id_1}")
print(f"   Project 2: {project_id_2}")
