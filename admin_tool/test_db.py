from src.db.quote_repo import QuoteRepository
import firebase_admin
from firebase_admin import credentials, firestore

def test_connection():
    repo = QuoteRepository()
    try:
        quotes = repo.get_pending_quotes()
        print(f"✅ Found {len(quotes)} pending quotes.")
        for q in quotes:
            print(f"- Project: {q.get('project_id')}, Status: {q.get('status')}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_connection()
