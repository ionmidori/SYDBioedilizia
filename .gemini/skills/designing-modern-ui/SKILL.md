---
name: designing-modern-ui
description: Design stunning, premium web interfaces using 2026 trends like Bento Grids, Glassmorphism, and Material 3 Expressive. Use when creating new layouts, redesigning dashboards, or applying high-end visual styles.
---

# Designing Modern UI

Create premium, "WOW" factor interfaces using modern architectural patterns and advanced CSS techniques.

## Core Design Principles (2026)

1. **Bento Grid Layouts**: Modular, asymmetric grids that organize diverse content into a cohesive "box" system.
2. **Glassmorphism**: Layers of translucent surfaces with delicate blurs and vibrant border gradients.
3. **Dynamic Motion**: Subtle micro-animations that make the interface feel alive and responsive.
4. **Expressive Typography**: Mixing serif headings (Playfair, Cinzel) with functional sans-serif bodies (Outfit, Lato).

## Implementation Guides

### 1. Layout Systems
Master the art of the Bento Grid for dashboards and landing pages.
- **Refer to [LAYOUTS.md](LAYOUTS.md)** for grid math, spans, and responsive logic.

### 2. Styling & Aesthetics
Apply high-end visual effects including glassmorphism and custom gradients.
- **Refer to [STYLING.md](STYLING.md)** for utility classes and CSS variables.

## Quick Start Template
See **[examples/bento-dashboard.tsx](examples/bento-dashboard.tsx)** for a production-ready React component implementing these styles.

## Best Practices
- **Contrast for Accessibility**: Ensure glass surfaces have sufficient contrast against backgrounds.
- **Performance**: Use `backdrop-filter: blur()` sparingly on mobile screens to minimize GPU load.
- **Hierarchy**: Use variable grid spans to emphasize important data points.
