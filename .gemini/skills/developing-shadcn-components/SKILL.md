---
name: developing-shadcn-components
description: Builds and customizes Shadcn/UI components on Radix primitives for the SYD platform. Covers composition patterns, theming with Tailwind CSS variables, accessibility, and dark mode. Use when building complex UI components, data tables, command menus, or forms.
---

# Developing Shadcn Components — SYD Patterns

## Component Directory

SYD components live in [web_client/components/ui/](web_client/components/ui/). They are copied (not installed) from Shadcn/UI and customized.

## Core Principles

1. **Composition over inheritance**: Build on Radix UI primitives, compose with `className` merging via `cn()` utility
2. **Props-driven**: Pass data as props; business logic stays in hooks or server actions
3. **Dark mode**: SYD uses `class="dark"` on `<html>`. Theme via CSS variables in `globals.css`

## Theming

Shadcn theme variables are defined in `globals.css`:

```css
:root {
  --primary: 201 65% 25%;     /* luxury-dark */
  --primary-foreground: 0 0% 98%;
  --accent: 168 58% 39%;      /* luxury-accent */
  --destructive: 0 84% 60%;
}
```

Override per-component with Tailwind utilities: `bg-primary text-primary-foreground`.

## Key Patterns

### Dialog/Modal with AnimatePresence
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent asChild>
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={M3Transition.containerTransform}
    >
      {children}
    </motion.div>
  </DialogContent>
</Dialog>
```

### Data Table
- Use `@tanstack/react-table` for headless logic
- Shadcn `Table` components for rendering
- Server-side pagination via SWR/TanStack Query

## Rules

- **Accessibility**: Radix handles ARIA; always add labels for dynamic content
- **Dynamic imports**: Use `next/dynamic` for heavy components (charts, maps)
- **No v0.dev**: SYD uses Claude Code for AI-assisted UI, not Vercel v0
