# M3 Expressive Shape Specifications

## Message Bubbles
- **Sent (User):** 
  - Top-left: 24px
  - Top-right: 24px
  - Bottom-left: 24px
  - Bottom-right: 4px (Tailwind: `rounded-[24px_24px_4px_24px]`)
- **Received:** 
  - Top-left: 24px
  - Top-right: 24px
  - Bottom-left: 4px (Tailwind: `rounded-[24px_24px_24px_4px]`)
  - Bottom-right: 24px

## Container Radii
- **Main Chat Window:** 32px (Extra Large)
- **Input Field:** 28px (Pill shape)
- **Buttons:** 20px (Medium-Large)

## Visual Hierarchy
- Use `elevation-1` for neutral messages.
- Use `elevation-2` for highlighted/important messages.
- Use `glassmorphism` (backdrop-blur-md + border-white/10) for overlay panels.
