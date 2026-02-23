---
description: Workflow for building modern, accessible UIs using Tailwind CSS, Shadcn/UI, and React Composition patterns.
---

# Modern UI Engineering

This skill focues on creating "WOW" factor UIs that remain maintainable. It leverages the "copy-paste" architecture of Shadcn/UI combined with advanced Tailwind patterns.

## 1. Component Architecture (Shadcn/UI)

*   **Ownership**: You own the code in `components/ui`. Modify it freely to fit the brand.
*   **Anatomy**: Wrapper around Radix Primitives (accessibility) + Tailwind (styling) + `cva` (variants).

### Customizing Variants
Use `cva` (Authority) to define visual variants cleanly.

```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors...", 
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Add new variants here
        "glowing": "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)] hover:shadow-[0_0_25px_rgba(var(--primary),0.7)]",
      },
      size: { ... },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

## 2. Advanced Tailwind Patterns

### `cn` Utility
Always use the `cn` (`clsx` + `tailwind-merge`) utility to merge classes. This allows consumers to override styles safely.

```tsx
export function Card({ className, ...props }: CardProps) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  )
}
```

### Arbitrary Values vs Design Tokens
*   **Avoid**: `w-[325px]` (Magic Numbers).
*   **Prefer**: `w-80` or `max-w-md` (Design Tokens).
*   **Exception**: Animation keyframes or highly specific layouts where tokens fail.

## 3. Composition Patterns

### Slot Pattern (Polymorphism)
Use `@radix-ui/react-slot` to create polymorphic components that merge props onto their child.

```tsx
import { Slot } from "@radix-ui/react-slot"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return <Comp ref={ref} {...props} />
})
```
*Usage*:
```tsx
<Button asChild>
  <Link href="/login">Login</Link>
</Button>
```
This renders an `<a>` tag with the *styles* of a `Button`.

## 4. State Management in UI

### URL State > global State
For filtering, sorting, and modal visibility, use URL Search Params. This makes the UI shareable and bookmarkable.

*   Use `useSearchParams` and `usePathname` from `next/navigation`.
*   Update state via `router.push('?modal=open')`.

### Composition for Loading States
Use `Suspense` boundaries for loading skeletons.

```tsx
<Suspense fallback={<DashboardSkeleton />}>
  <DashboardMetrics />
</Suspense>
```
