---
name: designing-modern-ui
description: Designs premium web interfaces using Bento Grids, Glassmorphism, and Material Design 3 Expressive for the SYD platform. Covers layout systems, surface layers, typography mixing, and responsive patterns. Use when creating new layouts, redesigning sections, or applying high-end visual styles.
---

# Designing Modern UI — SYD Design System

## Design Stack

- **Tailwind 4** + custom CSS variables in [globals.css](web_client/app/globals.css)
- **M3 Expressive** motion via [lib/m3-motion.ts](web_client/lib/m3-motion.ts)
- **Typography**: Cinzel (headings), Playfair Display (serif accents), Outfit (body), Lato (sans fallback)

## Bento Grid Layouts

Modular, asymmetric grids for dashboards and landing pages:

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}
/* Hero card spans 2 cols */
.bento-grid > :first-child { grid-column: span 2; grid-row: span 2; }
/* Responsive: stack on mobile */
@media (max-width: 768px) { .bento-grid { grid-template-columns: 1fr; } }
```

## Glassmorphism Layers

SYD surface hierarchy (defined in globals.css):

```css
.surface-container-low {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.surface-container-high {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
```

Layer glass surfaces from low → high to create depth. Cards on `.surface-container-low` backgrounds use `.surface-container-high`.

## SYD Color Palette

```css
--luxury-bg: #0a0a0a;
--luxury-text: #f5f5f5;
--luxury-gold: #C9A84C;       /* Accent, CTAs, HR lines */
--luxury-dark: #264653;       /* Headers, primary surfaces */
--luxury-accent: #2A9D8F;     /* Success, active states */
```

## Rules

1. **Contrast**: Glass surfaces must meet WCAG AA contrast against background
2. **`backdrop-filter`**: Use sparingly on mobile (GPU-intensive); fallback to solid bg
3. **Hierarchy**: Variable grid spans emphasize important data
4. **Motion**: Always use `M3Spring` presets from `lib/m3-motion.ts`, never ad-hoc values
5. **Mobile-first**: Design for `375px` width first, then `md:` and `lg:` breakpoints
