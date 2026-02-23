# Bento Grid Layouts

Bento grids are the gold standard for modern 2026 dashboards. They allow for asymmetrical yet balanced organization of information.

## Grid Fundamentals
Use Tailwind's grid system with varying `col-span` and `row-span`.

### Core Structure (Next.js/Tailwind)
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[180px]">
  {/* Large Feature Card */}
  <div className="md:col-span-2 md:row-span-2 glass-card">
    <h3>Project Vision</h3>
  </div>
  
  {/* Tall Stat Card */}
  <div className="md:col-span-1 md:row-span-2 glass-card">
    <h3>Quick Stats</h3>
  </div>
  
  {/* Wide Bottom Card */}
  <div className="md:col-span-2 glass-card">
    <h3>Recent Activity</h3>
  </div>
</div>
```

## Responsive Patterns
1. **Mobile (1 col)**: Everything stacks vertically. `auto-rows` keeps height consistent.
2. **Tablet (2 cols)**: Group cards in pairs.
3. **Desktop (4+ cols)**: Move to asymmetrical spans.

## Design Tips
- **Gaps**: Use `gap-6` or `gap-8` for a spacious, luxury feel.
- **Inertia**: Cards should have a subtle hover transform: `transition-transform hover:-translate-y-1`.
- **Content Density**: Mix interactive cards (graphs, buttons) with static visuals (icons, typography) to prevent cognitive overload.
