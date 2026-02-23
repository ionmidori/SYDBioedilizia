---
name: developing-shadcn-components
description: Master advanced Shadcn/UI patterns and technical steering for AI-generated components. Use when building complex dashboards, data tables, command menus, and forms using Next.js and Tailwind CSS.
---

# Developing Shadcn Components

Accelerate your frontend development by mastering the "AI-Ready" components of Shadcn/UI. This skill focuses on advanced patterns and effective "v0.dev-style" technical steering.

## Core Concepts

1. **Composition Over Inheritance**: Shadcn components are built on Radix UI primitives and are designed to be copied, not installed as a monolith.
2. **AI-Ready Architecture**: The clear, modular structure of the code makes it exceptionally easy for AI agents to refactor and extend.
3. **Theming & Customization**: Leveraging Tailwind CSS variables for global design system control.

## Specialized Guides

### 1. Advanced Component Patterns
Master complex components like Data Tables, Interactive Charts, and Multi-step Forms.
- **Refer to [COMPONENTS.md](COMPONENTS.md)** for best practices on state management and data fetching.

### 2. AI Steering (v0.dev Best Practices)
Learn how to use "Technical Steering" to get pixel-perfect results from AI UI generators.
- **Refer to [PROMPTING.md](PROMPTING.md)** for prompt templates and steering tokens.

## Code Examples
- **[examples/data-table-pro.tsx](examples/data-table-pro.tsx)**: A high-fidelity data table with filtering, sorting, and row selection.

## Best Practices
- **Keep Components Pure**: Pass data as props; keep business logic in hooks or server actions.
- **Accessibility (a11y)**: Shadcn handles the heavy lifting, but ensure you manage ARIA labels for dynamic content.
- **Performance**: Use dynamic imports for heavy components like charts or maps.
