# TASK: Fix Architectural Vulnerability in Sandwich Defense (Prompt Injection)

**Context:** 
The system prompts in `src/prompts/components/security.py` instruct the LLM to treat anything within `###` delimiters as untrusted user input (Sandwich Defense pattern). However, the actual orchestrator (`src/adk/adk_orchestrator.py`) currently passes the sanitized user input to the Vertex AI Agent Engine directly as raw text inside a `types.Part(text=sanitized_input)`, without applying the required delimiters. This creates a mismatch and a potential Prompt Injection vulnerability.

**Objective:**
Ensure that user input is cryptographically or structurally separated from system instructions as per the existing security constraints, mitigating OWASP LLM01 (Prompt Injection).

---

## Execution Checklist

### 1. Update `adk_orchestrator.py`
- [ ] Locate the `stream_chat` method.
- [ ] Find where `content_parts = [types.Part(text=sanitized_input)]` is constructed.
- [ ] Wrap `sanitized_input` with the expected `###` delimiters before injecting it into the `types.Part`.
  - *Example:* `delimited_input = f"###\n{sanitized_input}\n###"`

### 2. Verify `security.py` Alignment
- [ ] Confirm that `src/prompts/components/security.py` strictly mentions the `###` delimiter.
- [ ] Ensure the wording clearly specifies that the content inside the delimiters is *data* and must not override instructions. (Already verified in previous audit, but good to double-check).

### 3. Review `data_sanitizer.py`
- [ ] Check if the user input could maliciously contain `###` to break out of the delimiter boundary.
- [ ] Ensure `data_sanitizer.py` escapes or strips standalone `###` markers from the raw input before wrapping it in `adk_orchestrator.py`.
  - *Action:* If `###` is found in user input, replace it with a safe equivalent (e.g., `---` or strip it entirely) so the user cannot close the delimiter early and start a new "system" block.

### 4. Unit Testing
- [ ] Create or update a test in `tests/unit/test_sanitizer.py` to verify that `###` in user input is neutralized.
- [ ] Ensure the integration between the input, the sanitizer, and the delimiter wrapping behaves as expected.

### 5. Final Audit
- [ ] Run `uv run pyright src/` to ensure no typing issues were introduced.
- [ ] Run `uv run pytest tests/unit/` to ensure all tests pass.
