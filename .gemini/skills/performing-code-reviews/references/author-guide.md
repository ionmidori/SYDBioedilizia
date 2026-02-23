# The Change Author's Guide
*Based on Google's Engineering Practices*

## 1. Writing Good PR Descriptions
A good PR description (or CL description) is a record of **what** was changed and **why**.

- **First line**: A short summary of the change.
- **Body**: Detailed description of the problem, the solution, and any tradeoffs made.
- **Context**: Link to relevant issues or design docs.

## 2. Small Changes
Small changes are easier to review, faster to merge, and less likely to introduce bugs.

- **Atomicity**: Changes should be atomic—they should do one thing and do it completely.
- **Refactoring vs. Features**: Avoid mixing large refactors with new feature implementation. Do the refactor in a separate PR.
- **Size**: Aim for less than 200 lines of code change per PR when possible.

## 3. Handling Review Feedback
- **Don't take it personally**: The goal is code health, not personal criticism.
- **Respond to every comment**: Even if just to say "Done" or "Acknowledged."
- **Resolve conflicts promptly**: If you disagree, explain your reasoning clearly and seek a common ground.
