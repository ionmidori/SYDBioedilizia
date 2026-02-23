# Glassmorphism & Stylistic Tokens

Professional aesthetics in 2026 rely on depth, light, and transparency.

## 1. Glassmorphism Recipe
To achieve a "premium" glass effect, combine semi-transparent backgrounds with blurs and subtle borders.

### Tailwind Implementation
```css
.glass-surface {
  @apply bg-white/10 backdrop-blur-md border border-white/20 shadow-xl;
  @apply dark:bg-black/20 dark:border-white/10;
}
```

## 2. Gradient Systems
Avoid flat colors. Use vibrant, harmonious gradients for backgrounds and borders.

### Dynamic Border Gradient
```css
.gradient-border {
  position: relative;
  border-radius: inherit;
}

.gradient-border::before {
  content: "";
  position: absolute;
  inset: -1px; /* The border thickness */
  background: linear-gradient(to right, #6366f1, #a855f7, #ec4899);
  z-index: -1;
  border-radius: inherit;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
}
```

## 3. Typography Pairings
- **Headings**: `font-serif` (Playfair Display) for an elegant, architectural look.
- **Numbers/Data**: `font-mono` or tight sans-serif for technical clarity.
- **Accents**: Small-caps or wide tracking for labels.

## 4. Visual Micro-animations
Use Framer Motion for entrance effects:
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: "easeOut" }}
/>
```
