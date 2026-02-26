# 🖼️ Gallery Quick Start Guide

## 5-Minute Setup

### 1. Basic Usage

```tsx
import { OptimizedGalleryViewer } from '@/components/gallery/OptimizedGalleryViewer';

export function MyPage() {
  const images = [
    {
      id: '1',
      url: 'https://example.com/image.jpg',
      title: 'Living Room Render',
      type: 'render',
      metadata: { room: 'soggiorno' }
    }
  ];

  return (
    <div className="h-[70vh]">
      <OptimizedGalleryViewer images={images} />
    </div>
  );
}
```

### 2. With MediaAsset (from Firestore)

```tsx
import { OptimizedGalleryViewer, type GalleryImage } from '@/components/gallery/OptimizedGalleryViewer';

export function ProjectGallery({ assets }: { assets: MediaAsset[] }) {
  // Convert MediaAsset to GalleryImage
  const galleryImages: GalleryImage[] = assets.map(asset => ({
    id: asset.id,
    url: asset.url,
    thumbnail: asset.thumbnail,
    title: asset.title,
    type: asset.type as 'image' | 'render' | 'video' | 'quote',
    metadata: asset.metadata,
  }));

  return (
    <div className="h-screen">
      <OptimizedGalleryViewer
        images={galleryImages}
        title="File Progetto"
        enableVirtualization={assets.length > 50}
      />
    </div>
  );
}
```

### 3. Standalone Lightbox

```tsx
import { AdvancedLightbox } from '@/components/gallery/AdvancedLightbox';
import { useState } from 'react';

export function GalleryPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const images = [/* ... */];

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open Gallery</button>

      <AdvancedLightbox
        images={images}
        initialIndex={index}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

---

## Component Specs

### OptimizedGalleryViewer

```tsx
interface OptimizedGalleryViewerProps {
  /** Array of images to display */
  images: GalleryImage[];

  /** Gallery title (optional) */
  title?: string;

  /** Gallery subtitle (optional) */
  subtitle?: string;

  /** Enable virtual scrolling for large galleries (default: true) */
  enableVirtualization?: boolean;

  /** Callback when image is clicked */
  onImageClick?: (image: GalleryImage, index: number) => void;
}
```

**Requirements**:
- Wrap in container with `h-[height]` class
- Images must have `url` and `type` fields
- `type` must be one of: `'image' | 'render' | 'video' | 'quote'`

### AdvancedLightbox

```tsx
interface AdvancedLightboxProps {
  /** Array of images to display */
  images: GalleryImage[];

  /** Initial image index (default: 0) */
  initialIndex?: number;

  /** Is lightbox open? (required) */
  isOpen: boolean;

  /** Callback when closed (required) */
  onClose: () => void;

  /** Optional share handler */
  onShare?: (imageUrl: string) => Promise<void>;

  /** Enable keyboard shortcuts (default: true) */
  enableKeyboardShortcuts?: boolean;

  /** Enable swipe navigation (default: true) */
  enableSwipeNavigation?: boolean;
}
```

**Features Included**:
- ✅ Zoom (pinch, scroll, +/- buttons)
- ✅ Navigation (arrows, swipe, ←→ keys)
- ✅ Keyboard shortcuts (I, F, ESC, 0)
- ✅ Fullscreen (F key, button)
- ✅ Share (Web Share API)
- ✅ Download button

### VirtualizedGalleryGrid

```tsx
interface VirtualizedGalleryGridProps {
  items: GalleryItem[];
  onItemClick: (item: GalleryItem, index: number) => void;
  columnCount?: number;    // Override auto-calculation
  gap?: number;            // Spacing between items (default: 16)
  itemAspectRatio?: number; // For future use
}
```

**Use when**: You need just the grid without the lightbox.

---

## Common Patterns

### Pattern 1: Replace Old AssetGallery

**Before**:
```tsx
<AssetGallery assets={assets} />
```

**After**:
```tsx
const galleryImages = assets.map(a => ({...}));
<OptimizedGalleryViewer images={galleryImages} />
```

### Pattern 2: Grouped Galleries

```tsx
const groupedAssets = groupAssetsByType(assets);

{Object.entries(groupedAssets).map(([type, items]) => (
  <section key={type}>
    <h2>{type}</h2>
    <div className="h-[500px]">
      <OptimizedGalleryViewer
        images={items.map(convertToGalleryImage)}
      />
    </div>
  </section>
))}
```

### Pattern 3: With Search/Filter

```tsx
const [query, setQuery] = useState('');

const filtered = images.filter(img =>
  img.title?.toLowerCase().includes(query.toLowerCase())
);

return (
  <>
    <input
      placeholder="Search images..."
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
    <div className="h-[70vh]">
      <OptimizedGalleryViewer images={filtered} />
    </div>
  </>
);
```

### Pattern 4: Mobile-Optimized

```tsx
const isMobile = useMediaQuery('(max-width: 640px)');

return (
  <div className={isMobile ? 'h-screen' : 'h-[70vh]'}>
    <OptimizedGalleryViewer
      images={images}
      enableVirtualization={!isMobile}
    />
  </div>
);
```

---

## Keyboard Shortcuts

Users can see shortcuts by clicking the **Info (i)** button in the lightbox.

| Shortcut | Action |
|----------|--------|
| `←` `→` | Navigate images |
| `+` `-` | Zoom in/out |
| `0` | Reset zoom to 1x |
| `I` | Toggle info panel |
| `F` | Toggle fullscreen |
| `ESC` | Close lightbox |

---

## Styling & Customization

### Theme Colors

Edit `globals.css`:

```css
:root {
  --luxury-gold: #e9c46a;  /* Accent color */
  --luxury-bg: #0a0e27;    /* Background */
  --luxury-text: #f5f5f5;  /* Text color */
}
```

### Grid Gap

```tsx
<OptimizedGalleryViewer
  images={images}
  gap={24} // Increase spacing
/>

// or with VirtualizedGalleryGrid:
<VirtualizedGalleryGrid
  items={items}
  gap={24}
  onItemClick={handleClick}
/>
```

### Animation Speed

Edit `lib/m3-motion.ts`:

```tsx
export const M3Spring = {
  standard: {
    type: "spring",
    stiffness: 300,  // Higher = faster
    damping: 30
  },
  expressive: {
    type: "spring",
    stiffness: 200,
    damping: 20
  },
};
```

---

## Troubleshooting

### Issue: Grid shows blank space

**Solution**: Ensure parent container has explicit height:

```tsx
// ❌ Wrong
<OptimizedGalleryViewer images={images} />

// ✅ Correct
<div className="h-[500px]">
  <OptimizedGalleryViewer images={images} />
</div>
```

### Issue: Lightbox doesn't open on click

**Solution**: Verify OptimizedGalleryViewer is handling clicks:

```tsx
// Component manages lightbox state internally
// Just pass isOpen={true} to AdvancedLightbox directly
<AdvancedLightbox
  images={images}
  isOpen={true}
  onClose={() => {}}
/>
```

### Issue: Images not loading

**Solution**: Check image URLs are valid:

```tsx
const images = [
  {
    id: '1',
    url: 'https://example.com/image.jpg', // ✅ Must be HTTPS or relative path
    type: 'image'
  }
];
```

### Issue: Virtual scrolling causes layout shift

**Solution**: The grid calculates dimensions asynchronously. Provide parent height:

```tsx
// ✅ Recommended
<div className="h-screen w-full">
  <OptimizedGalleryViewer images={images} />
</div>
```

---

## Performance Tips

### Large Collections (100+)

```tsx
// ✅ Enable virtualization
<OptimizedGalleryViewer
  images={images}
  enableVirtualization={true}  // Auto-enabled if > 50 items
/>
```

### Small Collections (< 10)

```tsx
// ✅ Disable virtualization for simplicity
<OptimizedGalleryViewer
  images={images}
  enableVirtualization={false}
/>
```

### Image Optimization

Provide thumbnails for faster grid rendering:

```tsx
const images = [
  {
    id: '1',
    url: 'https://example.com/4k-image.jpg',  // Full res
    thumbnail: 'https://example.com/thumb.jpg', // 200x200
    title: 'Render',
    type: 'render'
  }
];
```

### Lazy Loading

Images use native `loading="lazy"` + `decoding="async"`:

```html
<!-- Automatically applied -->
<img
  loading="lazy"
  decoding="async"
  src="image.jpg"
/>
```

---

## Testing

### Jest Unit Test Example

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { OptimizedGalleryViewer } from '@/components/gallery/OptimizedGalleryViewer';

test('opens lightbox on image click', () => {
  const images = [{ id: '1', url: '...', type: 'image' }];
  render(<OptimizedGalleryViewer images={images} />);

  const image = screen.getByRole('button');
  fireEvent.click(image);

  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

### E2E Test Example (Playwright)

```typescript
test('keyboard shortcuts work in lightbox', async ({ page }) => {
  await page.goto('/gallery');

  // Open first image
  await page.click('[role="button"]:first-of-type');

  // Press right arrow
  await page.press('body', 'ArrowRight');

  // Verify next image loaded
  expect(await page.locator('img').getAttribute('src')).toBeDefined();
});
```

---

## API Reference

### GalleryImage Type

```tsx
interface GalleryImage {
  /** Unique identifier */
  id: string;

  /** Full-resolution image URL */
  url: string;

  /** Thumbnail URL (optional, improves performance) */
  thumbnail?: string;

  /** Display title */
  title?: string;

  /** Long description */
  description?: string;

  /** Asset type for display & filtering */
  type: 'image' | 'render' | 'video' | 'quote';

  /** Additional metadata (shown in info panel) */
  metadata?: Record<string, any>;
}
```

---

## Resources

- **Full Documentation**: See `GALLERY_OPTIMIZATION_GUIDE.md`
- **Implementation Details**: See `GALLERY_IMPLEMENTATION_SUMMARY.md`
- **Source Code**: `components/gallery/*.tsx`

---

**Last Updated**: 2026-02-26
**Status**: Production Ready ✅
