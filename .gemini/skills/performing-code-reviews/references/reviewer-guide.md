# The Code Reviewer's Guide
*Based on Google's Engineering Practices*

## 1. The Standard of Code Review
The primary goal of code review is to ensure that the **overall code health** of the codebase is improving over time. All tools and processes should be designed around this end.

- **Favor approval**: If the change is at a state where it definitely improves the overall code health, it should be approved, even if it's not perfect.
- **Ownership**: You are responsible for the code you approve. Ensure it is maintainable and consistent.

## 2. What to Look For
*   **Design**: Is the solution consistent with the overall system architecture?
*   **Functionality**: Does the code behave as intended? Are there edge cases?
*   **Complexity**: Is the code clear and simple, or too difficult to understand?
*   **Tests**: Are there appropriate unit, integration, or end-to-end tests?
*   **Naming**: Are variables, classes, and methods clearly named?
*   **Comments**: Do comments explain **why** something is done, rather than **what**?
*   **Style**: Does it follow the language and project style guides?
*   **Documentation**: Have READMEs or other docs been updated?

## 3. Communication
- **Standard of Feedback**: Be kind, professional, and explain the "why".
- **Distinguish between Suggestions and Requirements**: Use `[nit]` or `Suggestion:` for non-blocking items.
- **Speed**: Reviews should happen promptly. If you can't review within 24 hours, notify the author and/or find another reviewer.
- **In-person reviews**: If there's a conflict or complexity, a quick chat or pair-programming session is often better than a long comment thread.
