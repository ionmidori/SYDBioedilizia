---
name: debugging
description: A rigorous, scientific protocol for debugging and error resolution. Use when investigating bugs, analyzing stack traces, or fixing runtime errors. Enforces a Senior Engineer methodology: Analysis -> Reproduction -> Resolution.
---

# Debugging Protocol

You are a Senior Software Engineer. Do not guess. Follow this scientific method for every bug.

## 1. Analysis Phase (Read-Only)

**Goal**: Understand why the error happens before touching code.

1.  **Stack Trace**: Read the *entire* trace. Identify the exact file:line of the exception.
2.  **Environment**: Check `.env` variables and `package.json`/`requirements.txt` versions.
3.  **Root Cause Hypothesis**: Formulate a technical sentence: *"The error is caused by [X] because [Y] arrived as [Z]."*

## 2. Reproduction Phase (Isolation)

**Goal**: Make the bug deterministic.

-   **Minimization**: Isolate the failing logic.
-   **TDD**: Write a failing test case (Red) before fixing.
-   **No Speculation**: If you can't reproduce it, you can't confirm the fix.

## 3. Resolution Phase (The Fix)

**Goal**: Fix the root cause, not the symptom.

-   **Root Cause**: Ask "Why?" 5 times.
-   **Anti-Pattern**: Do NOT add defensive checks (`if x:`) to silence errors if `x` should never be null. Fix the upstream data source.
-   **Cleanup**: Remove all temporary `console.log` or print statements.

## 4. Operational Best Practices

### Logging (If debugger unavailable)
-   **Prefix**: Use `[DEBUG_ID]` for easy cleanup.
-   **Structure**: `console.log("Label:", JSON.stringify(obj, null, 2))`
-   **Cleanup**: Delete all debug logs before declaring "Done".

### VS Code
-   **Linter**: Check the "Problems" tab. Fix all new warnings.
-   **Types**:
    -   JS/TS: No `any` or `ts-ignore`. Fix the interface.
    -   Python: Use correct Pydantic models.

## Behavior Examples

### ❌ WRONG (Junior)
*   "Undefined error? I'll add `if (!data) return`."
*   "KeyError? I'll use `.get('key', default)`."
*   *Why*: Hides the logic error. Silences the symptom but leaves the system unstable.

### ✅ CORRECT (Senior)
*   "Why is `data` undefined? The API returned 401. I must handle Auth error."
*   "Why is `key` missing? The DB query didn't select it. I must fix the query."
