---
description: Best practices for Firestore data modeling, optimization, and security in Python. Covers schema design, preventing read amplification, and sharding counters.
---

# Firestore Data Modeling & Optimization

This skill provides expert patterns for designing scalable, cost-effective Firestore data structures. It focuses on preventing "read amplification" and managing high-concurrency data.

## 1. Core Data Modeling Principles

### Read Amplification vs Data Duplication
*   **The Problem**: Firestore charges per document read. Normalizing data (SQL-style) leads to N+1 reads.
*   **The Solution**: **Denormalize**. Duplicate data that is frequently read together but rarely changed.
    *   *Example*: Store `author_name` and `author_avatar` directly in the `Post` document. Do not fetch `User` just to render a news feed.

### The 1-MB Limit
*   **Constraint**: Max document size is 1 MiB.
*   **Pattern**: **Subcollections** for unbounded lists (e.g., Comments, Logs).
    *   *Bad*: `Post.comments: List[Comment]` (Will hit limit).
    *   *Good*: `Post/comments/{comment_id}`.

## 2. Optimization Patterns

### Aggregation Counters (Sharding)
Firestore limits write throughput to a single document (~1 write/sec). For high-frequency counters (e.g., "Likes"), use Distributed Counters (Sharding).

```python
import random
from firebase_admin import firestore

def increment_counter(doc_ref, num_shards=10):
    shard_id = int(random.random() * num_shards)
    shard_ref = doc_ref.collection("shards").document(str(shard_id))
    return shard_ref.update({"count": firestore.Increment(1)})

async def get_count(doc_ref):
    shards = doc_ref.collection("shards").get()
    return sum(s.get("count", 0) for s in shards)
```

### Composite Indexes & Querying
Firestore requires an index for every query that filters on multiple fields or sorts.
*   **Best Practice**: Define composite indexes in `firestore.indexes.json` to ensure consistent performance.
*   **Error**: `FailedPrecondition` typically means a missing index. The error message provides a link to create it.

## 3. Security Rules Strategies

Focus on **Attribute-Based Access Control (ABAC)**.

```javascript
/* firestore.rules */
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    // Project isolation
    match /projects/{projectId} {
      allow read, write: if isAuthenticated() && 
         (resource.data.ownerId == request.auth.uid || 
          request.auth.token.role == 'admin');
          
      // Subcollection permissions inherit context
      match /surveys/{surveyId} {
         allow read, write: if isOwner(get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId);
      }
    }
  }
}
```

## 4. Python SDK Best Practices

### Async Client
Always use `AsyncClient` in FastAPI to prevent blocking the event loop.

```python
from google.cloud import firestore

db = firestore.AsyncClient()

async def get_user(uid: str):
    doc = await db.collection("users").document(uid).get()
    return doc.to_dict()
```

### Batch Writes
Use `batch()` for atomic multi-document updates.

```python
batch = db.batch()
batch.set(doc_ref_1, data_1)
batch.update(doc_ref_2, updates)
await batch.commit()
```
