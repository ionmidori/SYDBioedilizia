---
description: Advanced FastAPI patterns for enterprise applications. Covers Dependency Injection, Service Layer architecture, Pydantic v2 validation, and Testing strategies.
---

# FastAPI Enterprise Patterns

This skill provides a comprehensive guide to building robust, scalable, and maintainable FastAPI applications. It emphasizes clean architecture, strict type safety, and rigorous testing.

## Core Principles

1.  **Dependency Injection (DI)**: The backbone of loose coupling. Use `Depends` for everything: services, repositories, configuration, and security.
2.  **Layered Architecture**: Strictly separate concerns:
    *   **Presentation Layer (`api/routes`)**: Handles HTTP requests/responses, input validation (Pydantic), and status codes. Minimal logic.
    *   **Service Layer (`services/`)**: Contains pure business logic. Orchestrates repositories and external integrations.
    *   **Data Access Layer (`repositories/`)**: Abstracts database interactions (Firestore, SQL, VectorDB).
    *   **Domain Models (`schemas/`)**: Pydantic models (DTOs) and internal entities.
3.  **Strict Typing**: No `Any`. Use generic types (`List[T]`, `Optional[T]`) and Pydantic v2 features.

## 1. Dependency Injection Patterns

### Service Injection
Avoid instantiating services directly in routes. Use a `get_service` dependency to allow easy mocking in tests.

```python
# src/dependencies.py
from fastapi import Depends
from src.services.user_service import UserService
from src.repositories.user_repo import UserRepository

def get_user_repo() -> UserRepository:
    return UserRepository()

def get_user_service(
    repo: UserRepository = Depends(get_user_repo)
) -> UserService:
    return UserService(repo=repo)

# src/api/routes/users.py
@router.post("/users")
async def create_user(
    user_data: UserCreate,
    service: UserService = Depends(get_user_service)
):
    return await service.create_user(user_data)
```

## 2. Service Layer Architecture

Services should contain the *business rules*. They should not know about HTTP (no `HTTPException` inside services if possible, or use domain-specific exceptions caught by middleware).

```python
# src/services/user_service.py
class UserService:
    def __init__(self, repo: UserRepository):
        self.repo = repo

    async def create_user(self, data: UserCreate) -> User:
        if await self.repo.get_by_email(data.email):
            raise UserAlreadyExistsError(data.email)
        return await self.repo.save(data)
```

## 3. Pydantic V2 Usage

Use `model_validator` and `field_validator` for strict data integrity.

```python
from pydantic import BaseModel, Field, model_validator

class ProjectConfig(BaseModel):
    name: str
    max_users: int = Field(gt=0)
    features: List[str]

    @model_validator(mode='after')
    def check_feature_compatibility(self) -> 'ProjectConfig':
        if "advanced_analytics" in self.features and self.max_users < 10:
             raise ValueError("Advanced analytics requires at least 10 users")
        return self
```

## 4. Testing Strategies

Use `pytest` and `httpx.AsyncClient` (via `TestClient` or `Lifespan` support).

### Integration Tests (API Level)
Mock the *service* layer dependencies to test the route logic in isolation from the DB, or use a test DB container.

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient
from main import app
from src.dependencies import get_user_service

@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c

@pytest.fixture
def mock_user_service():
    # Return a mock object
    return MockUserService()

# tests/api/test_users.py
async def test_create_user(client, mock_user_service):
    app.dependency_overrides[get_user_service] = lambda: mock_user_service
    response = await client.post("/users", json={"email": "test@example.com"})
    assert response.status_code == 201
```

## 5. Security & Middleware

*   **Global Exception Handling**: Catch domain exceptions and convert to JSON responses.
*   **Structured Logging**: Use `structlog` to bind request IDs and user context to all logs.

```python
# src/middleware/error_handler.py
@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(
        status_code=400,
        content={"error_code": exc.code, "message": str(exc)}
    )
```
