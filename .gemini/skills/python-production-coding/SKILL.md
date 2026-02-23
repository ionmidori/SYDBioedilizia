---
description: Definitive Python coding standards for Antigravity. Covers Project Structure, Modern Typing, Error Handling, Concurrency, and Testing. Based on Google Style Guide and Clean Code.
---

# Python Production Coding Standards

This skill establishes the "Gold Standard" for Python development in the Antigravity environment. It synthesizes the **Google Python Style Guide**, **Clean Code**, and modern Python 3.11+ features.

## 1. Project Structure (The "Src" Layout)

Always use the `src/` layout to prevent import errors and ensure packaging correctness.

```text
project_root/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── core/           # Business logic, domain models
│       ├── api/            # Routes, controllers
│       └── services/       # External integrations
├── tests/
│   ├── unit/
│   └── integration/
├── pyproject.toml          # Dependency management (uv/poetry)
└── README.md
```

## 2. Modern Typing (Strictness)

Python is no longer a dynamically typed language in our codebase. It is **Gradually Typed**.

*   **No `Any`**: Avoid `Any` at all costs. Use `object` if you really mean "anything".
*   **Pydantic V2**: Use `pydantic.BaseModel` for all data exchange objects (DTOs).
*   **Protocols**: Use `typing.Protocol` for structural subtyping (Duck Typing with enforcement).
*   **Runtime Checking**: Use `beartype` or `typeguard` for critical internal APIs if needed.

```python
from typing import Protocol, List, Optional
from pydantic import BaseModel

class User(BaseModel):
    id: str
    name: str

class UserRepository(Protocol):
    """Interface for User storage."""
    async def get(self, user_id: str) -> Optional[User]: ...
    async def save(self, user: User) -> None: ...
```

## 3. Error Handling (Hierarchy)

Exceptions are part of the API contract.

*   **Custom Hierarchy**: Define a base `AppError`.
*   **No Raw Exceptions**: Never raise `ValueError` or `KeyError` in the Service Layer. Wrap them.
*   **Root Handler**: Catch `AppError` in the API Middleware/Exception Handler, not in every route.

```python
# src/core/exceptions.py
class AppError(Exception):
    """Base exception."""
    pass

class DomainError(AppError):
    """Business logic violation."""
    pass

# Service Layer
def transfer_funds(amount: int):
    if amount < 0:
        raise DomainError("Negative amount")
```

## 4. Concurrency (Structured)

*   **No Fire-and-Forget**: Never use `asyncio.create_task` without storing the reference (garbage collection risk).
*   **TaskGroups (3.11+)**: Use `asyncio.TaskGroup` for managing child tasks.

```python
import asyncio

async def fetch_all(urls: List[str]):
    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(fetch(url)) for url in urls]
    
    # All tasks are awaited here. If one fails, others are cancelled.
    results = [t.result() for t in tasks]
```

## 5. Testing (Pytest Excellence)

*   **Fixtures**: Use `conftest.py` for shared setup.
*   **Parametrization**: Test multiple scenarios with `@pytest.mark.parametrize`.
*   **Markers**: Separate `unit`, `integration`, and `slow` tests.

```python
import pytest

@pytest.mark.parametrize("input,expected", [
    (1, 2),
    (2, 4),
    (3, 6),
])
def test_double(input, expected):
    assert double(input) == expected
```

## 6. Documentation (Google Style)

Docstrings are mandatory for all public modules, functions, classes, and methods.

```python
def fetch_user(user_id: int) -> User:
    """Fetches a user by ID from the database.

    Args:
        user_id: The unique identifier of the user.

    Returns:
        The User object if found.

    Raises:
        UserNotFoundError: If the user does not exist.
    """
    ...
```

## Checklist before PR
- [ ] **Typing**: `mypy` passes strict mode.
- [ ] **Linter**: `ruff` checks pass.
- [ ] **Tests**: Unit tests cover happy/sad paths.
- [ ] **Docs**: Public API is documented.
