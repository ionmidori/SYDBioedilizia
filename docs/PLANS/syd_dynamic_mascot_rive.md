# Project Plan: SYD Dynamic Interactive Mascot (Rive Integration)

**Date**: March 2026
**Author**: Senior Principal Architect
**Status**: Proposed
**Target Module**: `web_client/components/chat/ChatToggleButton.tsx`

---

## 1. Executive Summary
This plan outlines the architectural transition of the SYD chatbot mascot from a static image (`syd_final_v9.png`) to a fully interactive, state-driven 2D mesh animation using **Rive**. 

**Crucial Constraint:** The visual identity must remain exactly the same. We will NOT use a new character or vector model. Instead, the current `syd_final_v9.png` will be imported into Rive, rigged with a 2D mesh and bones, and animated.

The goal is to tie the mascot's behavior to the user's scroll activity:
- When the user scrolls the page down, SYD animates as if drawing.
- When the user stops scrolling, SYD waves its hand and then resumes the drawing animation.

## 2. Technical Stack Selection: Rive vs Lottie
**Decision:** `Rive (.riv)` via `@rive-app/react-canvas`.
**Rationale:**
- **2D Mesh Deformation:** Rive excels at taking a flat PNG, applying a mesh, and rigging it with bones. This allows us to animate the exact existing PNG without needing to redraw the character.
- **State Machine Architecture:** Logic (State Machines) lives directly within the asset. React only needs to toggle inputs based on scroll events, offloading complex timeline management.
- **Performance:** Hardware-accelerated (Canvas/WebGL) ensuring 60fps on mobile without blocking the React main thread during scroll events.

---

## 3. Asset Requirements (The `.riv` File)
The asset creation process requires importing `syd_final_v9.png` into the Rive Editor, cutting out the arm (or using mesh deformation) to allow independent movement, and setting up the following State Machine (e.g., named `SydScrollStateMachine`):

| Input Name | Type | Trigger Condition | Associated Animation |
| :--- | :--- | :--- | :--- |
| `isScrolling` | Boolean | `true` during window scroll | SYD performs a continuous "drawing" loop. |
| `onScrollStop` | Trigger | Fired when scroll stops | SYD interrupts the drawing, waves its hand once, and then the State Machine automatically transitions back to the "drawing" loop. |

*Note: The State Machine in Rive must be configured so that the "Wave" animation, upon completion, transitions automatically back to the "Drawing" animation.*

---

## 4. Implementation Steps (Frontend Tier 2)

### Step 1: Dependency Installation
Install the official Rive runtime for React.
```bash
cd web_client
npm install @rive-app/react-canvas
```

### Step 2: Asset Placement
Place the finalized `syd_scroll_mascot.riv` file in the `web_client/public/assets/` directory. Keep `syd_final_v9.png` as a fallback.

### Step 3: Component Refactoring (`ChatToggleButton.tsx`)
Refactor the existing component to use `framer-motion`'s scroll tracking (or a custom debounced scroll listener) to drive the Rive State Machine.

**Architecture Skeleton:**
```tsx
import React, { useEffect, useRef } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';
import { motion, useScroll } from 'framer-motion';
// ... existing imports ...

export function ChatToggleButton({ isOpen, onClick }: Props) {
    const { scrollY } = useScroll();
    const scrollTimeoutRef = useRef<NodeJS.Timeout>(null);
    
    const { rive, RiveComponent } = useRive({
        src: '/assets/syd_scroll_mascot.riv',
        stateMachines: 'SydScrollStateMachine',
        autoplay: true,
    });

    const isScrollingInput = useStateMachineInput(rive, 'SydScrollStateMachine', 'isScrolling');
    const scrollStopTrigger = useStateMachineInput(rive, 'SydScrollStateMachine', 'onScrollStop');

    useEffect(() => {
        return scrollY.onChange((current) => {
            // User is scrolling
            if (isScrollingInput && !isScrollingInput.value) {
                isScrollingInput.value = true;
            }

            // Clear previous timeout
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }

            // Set a timeout to detect when scrolling stops
            scrollTimeoutRef.current = setTimeout(() => {
                if (isScrollingInput) isScrollingInput.value = false;
                if (scrollStopTrigger) scrollStopTrigger.fire();
            }, 150); // 150ms after last scroll event
        });
    }, [scrollY, isScrollingInput, scrollStopTrigger]);

    return (
        <motion.div {...existingDragProps}>
            <Button
                onClick={handleClick}
                className="...existingClasses..."
            >
                <div className="w-full h-full">
                    <RiveComponent className="w-full h-full object-contain" />
                </div>
            </Button>
        </motion.div>
    );
}
```

### Step 4: Fallback & Accessibility
- Ensure the static `syd_final_v9.png` acts as a placeholder while the Rive canvas is loading or if WebGL is unsupported.
- Disable heavy Rive animations if the user has `prefers-reduced-motion` enabled.

---

## 5. Testing & Validation Strategy

- **Scroll Performance:** Tracking scroll events can cause jank. Ensure the use of Framer Motion's `useScroll` (which uses optimized passive listeners) combined with `setTimeout` does not drop frames below 60fps.
- **Visual Integrity:** Validate that the 2D mesh deformation in Rive does not distort the original PNG quality (check anti-aliasing and pixelation on high-DPI retina screens).
- **State Blending:** In the Rive editor, ensure the transition from Drawing -> Wave -> Drawing is blended (e.g., 200ms crossfade) so the robot's arm doesn't snap unnaturally.

---

## 6. Rollback Plan
If scroll-based animations cause performance regressions on lower-end mobile devices:
1. Revert `ChatToggleButton.tsx` to the native `next/image` implementation.
2. Uninstall `@rive-app/react-canvas`.