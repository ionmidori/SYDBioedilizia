---
name: mobile-native-ui-patterns
description: Implement mobile-native UI patterns for the web using Vaul (Drawers) and advanced touch interactions. Use when building PWA-like experiences, mobile menus, or bottom sheets.
---

# Mobile-Native UI Patterns

This skill focuses on creating web interfaces that feel distinguishable from native mobile apps, utilizing **Vaul** for drawers and CSS/Meta techniques for touch optimization.

## 1. The Drawer (Vaul)

Vaul is the standard for "Sheet" or "Drawer" interactions in React. It replicates the native iOS momentum scrolling and drag physics.

### Basic Implementation

```tsx
import { Drawer } from "vaul";

export function MobileMenu() {
  return (
    <Drawer.Root shouldScaleBackground>
      <Drawer.Trigger asChild>
        <button>Open Menu</button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="bg-white flex flex-col rounded-t-[10px] h-[96%] mt-24 fixed bottom-0 left-0 right-0">
          <div className="p-4 bg-white rounded-t-[10px] flex-1">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mb-8" />
            <div className="max-w-md mx-auto">
              <Drawer.Title className="font-medium mb-4">Title</Drawer.Title>
              <p>Content goes here...</p>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

### Critical Configuration
-   **`shouldScaleBackground`**: Adds the iOS "scale back" effect to the body content.
-   **`snapPoints`**: Use `snapPoints={[0.5, 1]}` for multi-stage drawers.
-   **`activeSnapPoint`**: Control the snap state programmatically.

## 2. Touch Optimization (CSS & Meta)

To achieve "Native Feel", you must disable default browser behaviors that reveal it's a website.

### Viewport Meta
Prevent zooming and bouncing.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
```

### CSS Hardening

```css
/* Globals.css */
html, body {
  /* Prevent bounce scroll on iOS (except in specific containers) */
  overscroll-behavior-y: none; 
  /* Prevent text selection unless needed */
  -webkit-user-select: none;
  user-select: none;
  /* Remove tap highlight color */
  -webkit-tap-highlight-color: transparent;
}

/* Re-enable selection for text content */
p, h1, h2, h3, span {
  -webkit-user-select: text;
  user-select: text;
}
```

## 3. Haptics (Vibration)

Provide physical feedback for interactions.

```typescript
// utils/haptics.ts
export const triggerHaptic = () => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10); // Light tap (10ms)
  }
};

// Usage
<button onClick={() => { triggerHaptic(); submit(); }}>Click Me</button>
```

## 4. Safe Area Insets

Respect the Notch and Home Indicator.

```css
.padding-safe {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.min-h-screen-safe {
  min-height: 100dvh; /* Dynamic Viewport Height handles address bar */
}
```

## Checklist

- [ ] Use **Vaul** for all bottom-sheet interactions (menus, details).
- [ ] Disable `user-select` globally, enable locally.
- [ ] Use `100dvh` instead of `100vh`.
- [ ] Add `triggerHaptic` to primary actions.
- [ ] Verify `overscroll-behavior` prevents "pull to refresh" if not desired.
