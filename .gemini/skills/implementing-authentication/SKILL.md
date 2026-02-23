---
name: implementing-authentication
description: Master authentication and authorization patterns including JWT, OAuth2, session management, and RBAC to build secure, scalable access control systems. Use when implementing auth systems, securing APIs, or debugging security issues.
---

# Authentication & Authorization Patterns

Patterns for implementing secure AuthN/AuthZ in **FastAPI** using **Firebase Authentication**.

## When to Use This Skill
- Securing FastAPI endpoints
- Implementing Role-Based Access Control (RBAC)
- Managing User Sessions (via Firebase ID Tokens)
- Handling Custom Claims (Admin, Moderator)
- enforcing Resource Ownership

## Core Concepts

### 1. Authentication (Who are you?)
In this architecture, **Firebase Auth** handles identity.
- **Frontend**: Signs in user -> Gets ID Token (JWT).
- **Backend**: Verifies ID Token -> Extracts `uid` and `claims`.

### 2. Authorization (What can you do?)
- **RBAC**: Checks `custom_claims` (e.g., `{"role": "admin"}`).
- **Resource Ownership**: Checks if `resource.user_id == current_user.uid`.

## Templates

### Template 1: Firebase Auth Middleware (FastAPI)
The standard pattern for protecting routes.

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
import logging

# Security Scheme
security = HTTPBearer()
logger = logging.getLogger(__name__)

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify Firebase ID Token and return user dict.
    Dependency for protected routes.
    """
    token = creds.credentials
    try:
        # Verify token with Firebase Admin SDK
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Usage in Routes
from fastapi import APIRouter

router = APIRouter()

@router.get("/me")
async def read_users_me(user: dict = Depends(get_current_user)):
    return {"uid": user["uid"], "email": user.get("email")}
```

### Template 2: Role-Based Access Control (RBAC)
Pattern for restricting access based on Firebase Custom Claims.

```python
from typing import List, Callable

class RoleChecker:
    """
    FastAPI Dependency to enforce role presense in Custom Claims.
    """
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: dict = Depends(get_current_user)):
        # Firebase puts custom claims at the top level of the decoded token
        # or inside a 'firebase' key depending on version. 
        # Usually it's top level for custom claims set via Admin SDK.
        user_role = user.get("role") 
        
        if user_role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
        return user

# Allow only Admins
allow_admin = RoleChecker(["admin"])
allow_editor = RoleChecker(["admin", "editor"])

# Usage
@router.delete("/users/{user_id}", dependencies=[Depends(allow_admin)])
async def delete_user(user_id: str):
    return {"status": "user deleted"}
```

### Template 3: Setting Custom Claims (Backend Admin)
You cannot set roles from the client. You must have an Admin endpoint.

```python
@router.post("/set-role")
async def set_user_role(
    target_uid: str, 
    role: str, 
    admin_user: dict = Depends(allow_admin) # Only admins can set roles
):
    """Assign a role to a user via Custom Claims."""
    if role not in ["admin", "editor", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    try:
        # Set custom user claims on this newly created user.
        auth.set_custom_user_claims(target_uid, {'role': role})
        return {"status": "success", "role": role}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Template 4: Resource Ownership (Service Layer)
Do not check ownership in the route data definition if complex. Check it in the Service.

```python
# src/services/post_service.py

def update_post(post_id: str, new_data: dict, current_user_uid: str):
    post = db.get_post(post_id)
    if not post:
        raise NotFoundException()
        
    # Ownership Check
    if post.owner_id != current_user_uid:
        # Optional: Allow admins to override
        # if not is_admin(current_user_uid):
        raise PermissionDeniedException("You do not own this post")
        
    return db.update_post(post_id, new_data)
```

## Security Best Practices (Python/FastAPI)

### Do's
- **Validate Tokens**: Always use `auth.verify_id_token()` on the backend. Never trust the client.
- **Use Dependencies**: Keep auth logic in `Depends()` to keep routes clean.
- **Log Auth Failures**: But never log the raw token!
- **Refresh Tokens**: Handle token expiration on the Frontend (Firebase SDK handles this automatically, just ensure you get a fresh token before API calls).

### Don'ts
- **Don't Roll Your Own Crypto**: Use Firebase Auth.
- **Don't Pass User Objects to Services**: Pass simple types (`user_id`, `email`) or Pydantic models to keep layers decoupled.
- **Don't Ignore Scopes**: If using OAuth methods, validate scopes for granular access.
