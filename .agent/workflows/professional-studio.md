---
description: Redesign dashboard components using the Professional Studio workflow (Vision + Bento + Shadcn).
---

# Professional Studio Redesign Workflow

Use this workflow to transform design mockups or vague requests into high-fidelity, production-ready React components.

## Prerequisites
- Active `designing-modern-ui` skill.
- Active `developing-shadcn-components` skill.
- Backend vision module `web_architect.py` functional.

## Step-by-Step Execution

### 1. Visual Analysis Phase
If the user provides an image or mockup:
- Trigger `web_architect.analyze_web_mockup` to extract the layout type, color palette, and component mapping.
- **Goal**: Identify if it's a **Bento Grid**, **Glassmorphism-heavy**, or **Material 3** design.

### 2. Layout Drafting
Use the `designing-modern-ui/LAYOUTS.md` patterns to create the structural grid.
- Apply `grid-cols-4` for desktop responsiveness.
- Use `auto-rows` for consistent card sizing.

### 3. Component Orchestration
Consult `developing-shadcn-components/PROMPTING.md` to select the right Shadcn/UI primitives.
- Map identifies "Hero Stat" → `Card` component.
- Map identifies "Data View" → `DataTablePro` example.

### 4. Aesthetic Refinement
Apply the 2026 styling tokens from `designing-modern-ui/STYLING.md`.
- Add `backdrop-blur-xl` and `bg-white/5` for glass surfaces.
- Implement `gradient-border` for high-priority cards.
- Ensure typography pairings (Serif for headers, Mono/Sans for data).

### 5. Interaction & Animation
- Wrap cards in `motion.div` from Framer Motion.
- Add subtle `-translate-y-1` hover effects.

## Command Reference
To trigger this workflow manually:
`antigravity studio redesign --component <TargetComponent>`
