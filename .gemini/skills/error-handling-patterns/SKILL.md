---
name: error-handling-patterns
description: Implements robust error handling strategies and patterns for resilient applications.
---

# Error Handling Patterns

This skill outlines strategies and implementation patterns for robust error handling across different programming languages and architectural layers.

## When to Use This Skill
- Designing API error responses
- Implementing retry logic for networked operations
- Creating fault-tolerant systems
- Structured logging and observability
- Handling exceptions in async workflows

## Core Concepts

### 1. Error Handling Philosophies
- **Fail Fast**: Identify and report errors immediately rather than propagating invalid state.
- **Graceful Degradation**: Maintain partial functionality when non-critical components fail.
- **Idempotency**: Ensure repeated operations produce the same result, critical for safe retries.

### 2. Error Categories
- **Transient Errors**: Temporary failures (network timeouts, rate limits) -> **Retry**.
- **Permanent Errors**: Logical or validation errors (400 Bad Request) -> **Fail immediately**.
- **System Errors**: Infrastructure failures (disk full, memory leak) -> **Alert & Log**.

## Language-Specific Patterns

### Python Error Handling
Prefer explicit exception handling with custom exception hierarchies.

```python
class AppError(Exception):
    """Base exception for application logic."""
    def __init__(self, message, error_code, details=None):
        super().__init__(message)
        self.error_code = error_code
        self.details = details or {}

class ResourceNotFoundError(AppError):
    def __init__(self, resource_id):
        super().__init__(
            f"Resource {resource_id} not found", 
            "RESOURCE_NOT_FOUND",
            {"id": resource_id}
        )

# Usage
try:
    user = get_user(uid)
except ResourceNotFoundError as e:
    logger.warning(f"User check failed: {e}")
    return create_new_user()
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    raise
```

### TypeScript/JavaScript Error Handling
Use discriminated unions or Result types for expected failures, try/catch for unexpected ones.

```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

async function fetchUser(id: string): Promise<Result<User, ApiError>> {
  try {
    const response = await api.get(`/users/${id}`);
    return { success: true, data: response.data };
  } catch (error) {
    if (isAxiosError(error)) {
        return { success: false, error: new ApiError(error) };
    }
    throw error; // Re-throw unexpected runtime errors
  }
}
```

### Rust Error Handling
Leverage `Result<T, E>` and the `?` operator for propagation.

```rust
fn read_config(path: &str) -> Result<Config, ConfigError> {
    let content = fs::read_to_string(path).map_err(ConfigError::Io)?;
    let config = toml::from_str(&content).map_err(ConfigError::Parse)?;
    Ok(config)
}
```

### Go Error Handling
Explicit error checking, wrapping errors with context.

```go
func processedData(id string) (*Data, error) {
    data, err := db.Get(id)
    if err != nil {
        return nil, fmt.Errorf("failed to get data for id %s: %w", id, err)
    }
    return data, nil
}
```

## Universal Patterns

### Pattern 1: Circuit Breaker
Prevent cascading failures by stopping calls to a failing service.

**States**:
- **Closed**: Requests flow normally. Failure count < Threshold.
- **Open**: Requests blocked immediately. Failure count >= Threshold.
- **Half-Open**: Allow trial request after timeout. Success -> Closed; Failure -> Open.

### Pattern 2: Error Aggregation
Collect multiple errors (e.g., validation) and report them together.

```python
errors = []
if not user.email: errors.append("Missing email")
if not user.age > 18: errors.append("User under 18")

if errors:
    raise ValidationError("Invalid User", details=errors)
```

### Pattern 3: Graceful Degradation
Return fallback data or cached version when primary source fails.

```javascript
try {
    return await fetchRealtimeData();
} catch (e) {
    console.warn("Realtime failed, using cache", e);
    return await getCachedData();
}
```

## Best Practices
1. **Never swallow errors**: Always log or handle. `except: pass` is forbidden.
2. **Context is King**: Logs must include `user_id`, `request_id`, `operation`.
3. **Internal vs External**: Never expose raw stack traces to API clients. Map to clean error codes.
4. **Timeouts**: Always set timeouts on external calls to prevent hanging.

## Common Pitfalls
- Catching generic `Exception` too early.
- Retrying non-idempotent operations (creating duplicate records).
- Logging sensitive data (PII/Secrets) in error messages.

## Resources
- [The Error Model (Google)](https://google.aip.dev/193)
- [Microservices Patterns: Circuit Breaker](https://microservices.io/patterns/reliability/circuit-breaker.html)
