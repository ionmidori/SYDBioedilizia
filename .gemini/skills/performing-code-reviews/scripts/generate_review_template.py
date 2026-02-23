#!/usr/bin/env python3
import sys

def generate_template(title):
    template = f"""## PR Review: {title}

### 🔍 Summary & Design
- [ ] Solution aligns with project architecture.
- [ ] Complexity is minimized; code is readable.

### ✅ Functionality & Tests
- [ ] Logic is correct; edge cases covered.
- [ ] New tests added and passing in CI.

### 📝 Code Health (Naming & Style)
- [ ] Names are descriptive and follow conventions.
- [ ] Comments explain 'why', not 'what'.
- [ ] Documentation updated if necessary.

### 🛡️ Security & Performance
- [ ] Input validation and sanitization.
- [ ] No N+1 queries or memory leaks.

---
**Verdict:** 
- [ ] LGTM (Approved)
- [ ] LGTM with nits (Approved)
- [ ] Changes Requested
"""
    print(template)

if __name__ == "__main__":
    title = sys.argv[1] if len(sys.argv) > 1 else "[Title]"
    generate_template(title)
