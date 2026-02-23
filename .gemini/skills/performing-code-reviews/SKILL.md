---
name: performing-code-reviews
description: Master effective code review practices to provide constructive feedback, catch bugs early, and foster knowledge sharing while maintaining team morale. Use when reviewing pull requests, establishing review standards, or mentoring developers.
---

# Code Review Excellence

Master Google's Engineering Practices to transform code reviews from gatekeeping to a collaborative process that improves overall code health.

## Core Principles

1. **Code Health First**: The goal is to ensure the codebase improves over time. Perfection is not the goal; "better than before" is.
2. **Standard of Excellence**: Favor approval if the change is a clear improvement.
3. **Speed**: Reviews should be fast to keep velocity high. Aim for a <24h turnaround.

## Comprehensive Guides

For detailed instructions based on Google's standards, see:
- **[Reviewer's Guide](references/reviewer-guide.md)**: What to look for (Design, Functionality, Tests) and how to communicate feedback.
- **[Author's Guide](references/author-guide.md)**: How to write great PR descriptions and manage small, atomic changes.

## Reviewer Checklist

### 1. Design & Architecture
- Is the solution consistent with the overall system?
- Are there simpler approaches? Is there unnecessary complexity?

### 2. Functionality & Tests
- Does it do what it says it does?
- Are there tests? Do they cover edge cases?

### 3. Maintainability (The "Why")
- Are names clear?
- Do comments explain **why** something is done, rather than **what**?

### 4. Security & Performance
- Input validation, N+1 queries, memory safety.

## Automation & Templates
- **[scripts/generate_review_template.py](scripts/generate_review_template.py)**: Generate a standard review summary and checklist.

## Best Practices
1. **Be Constructive**: Comment on the code, not the person. Use collaborative language ("What if we..." instead of "You should...").
2. **Small PRs**: Review changes in small, atomic chunks (<200 lines).
3. **Distinguish Nits**: Use `[nit]` for minor style suggestions that shouldn't block the merge.
4. **LGTM**: Use "Looks Good To Me" as the standard approval signal.

## Resources
- [Google Engineering Practices (GitHub)](https://github.com/google/eng-practices)
- [How to Write a Code Reviewer's Guide](https://google.github.io/eng-practices/review/reviewer/)
