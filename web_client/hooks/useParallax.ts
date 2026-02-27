import { useState, useEffect, useCallback } from 'react';

export interface ParallaxTilt {
    x: number; // -20 to +20 degrees
    y: number; // -20 to +20 degrees
}

/**
 * Custom hook for gyroscope-based parallax effect.
 * Creates subtle "holographic" tilt effect for images/renders.
 *
 * Automatically disabled if:
 * - DeviceOrientation not supported
 * - User has prefers-reduced-motion enabled
 */
export function useParallax(enabled: boolean = true) {
    const [tilt, setTilt] = useState<ParallaxTilt>({ x: 0, y: 0 });
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // Check for reduced motion preference
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            console.log('[Parallax] Disabled due to prefers-reduced-motion');
            return;
        }

        // Check for DeviceOrientation support
        if (!window.DeviceOrientationEvent || !enabled) {
            return;
        }

        // Use setTimeout to avoid synchronous setState warning inside effect
        const timeoutId = setTimeout(() => {
            setIsSupported(true);
        }, 0);

        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (!e.gamma || !e.beta) return;

            // Clamp values to prevent extreme rotation (-20° to +20°)
            const x = Math.min(Math.max(e.gamma, -20), 20); // Left/Right tilt
            const y = Math.min(Math.max(e.beta - 45, -20), 20);  // Front/Back tilt (offset by 45° for natural holding position)

            setTilt({ x, y });
        };

        window.addEventListener('deviceorientation', handleOrientation);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, [enabled]);

    /**
     * Convert tilt angles to CSS transform pixel offsets.
     * Max shift: 15px in any direction.
     */
    const getTransform = useCallback((maxShift: number = 15) => {
        if (!isSupported) return {};

        const offsetX = (tilt.x / 20) * maxShift; // Map -20:20 to -maxShift:maxShift
        const offsetY = (tilt.y / 20) * maxShift;

        return {
            transform: `translate(${offsetX}px, ${offsetY}px)`,
            transition: 'transform 0.1s ease-out' // Smooth movement
        };
    }, [tilt, isSupported]);

    return {
        tilt,
        isSupported,
        getTransform
    };
}

