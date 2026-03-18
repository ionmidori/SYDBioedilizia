---
name: mobile-native-ui-patterns
description: Mobile-native UI patterns for web using Vaul drawers, responsive dialog/drawer switching, touch CSS hardening, and safe area handling. Use when building bottom sheets, mobile menus, or PWA-like touch interactions.
---

# Mobile-Native UI Patterns

Make web interfaces feel native on mobile. SYD uses Vaul for drawers, a responsive dialog/drawer switcher, and CSS touch hardening.

## SYD Components

| Component | File | Purpose |
|-----------|------|---------|
| Drawer primitive | `components/ui/drawer.tsx` | Vaul wrapper (Shadcn) |
| Responsive switcher | `components/ui/responsive-drawer.tsx` | Dialog on desktop, Drawer on mobile |
| Swipe layout | `components/mobile/MobileSwipeLayout.tsx` | 3-pane swipe navigation (FM drag) |
| Mobile tabs | `components/mobile/ProjectMobileTabs.tsx` | Tab navigation for project views |

## Responsive Dialog/Drawer Pattern

Desktop shows a `Dialog`; mobile shows a Vaul `Drawer`. Uses `useMediaQuery` to switch:

```tsx
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';

<ResponsiveDrawer open={open} onOpenChange={setOpen} title="Conferma invio">
  {/* Same content renders in Dialog (desktop) or Drawer (mobile) */}
</ResponsiveDrawer>
```

All modals in SYD use this pattern: `BatchSubmitModal`, `AuthDialog`, `DeleteProjectDialog`, etc.

## Vaul Drawer Configuration

```tsx
<Drawer.Root shouldScaleBackground>  {/* iOS scale-back effect */}
  <Drawer.Content>
    <div className="mx-auto w-12 h-1.5 rounded-full bg-zinc-300 mb-4" /> {/* Drag handle */}
    {children}
  </Drawer.Content>
</Drawer.Root>
```

- `shouldScaleBackground`: Scales body content behind drawer (iOS feel)
- `snapPoints={[0.5, 1]}`: Multi-stage drawers
- Always include a visible drag handle (48px wide, centered)

## Touch CSS Hardening

Applied in `globals.css`:

```css
html, body {
  overscroll-behavior-y: none;       /* Prevent pull-to-refresh */
  -webkit-tap-highlight-color: transparent;
}
```

- `100dvh` instead of `100vh` (handles mobile address bar)
- `env(safe-area-inset-*)` for notch/home indicator padding
- `overscroll-behavior: none` on scroll containers to prevent bounce

## Swipe Navigation

SYD's `MobileSwipeLayout.tsx` uses Framer Motion `drag="x"` with `MotionValue`:

- 3-pane layout: Dashboard | Gallery | Chat
- Notch draggable: 48×48px touch target (WCAG compliant)
- Spring physics via `M3Spring.expressive` from `lib/m3-motion.ts`

## Checklist

- [ ] Use `ResponsiveDrawer` for all modal interactions (not raw Dialog on mobile)
- [ ] Drag handle visible on all drawers (accessibility)
- [ ] Use `100dvh` for full-height layouts
- [ ] Safe area insets on fixed bottom bars
- [ ] Test with Chrome DevTools device emulation + real device
