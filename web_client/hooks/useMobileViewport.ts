import { useState, useEffect, RefObject } from 'react';

/**
 * Custom hook for mobile viewport handling and body scroll locking
 * Extracted from ChatWidget.tsx (lines 222-230, 419-458)
 * Handles iOS keyboard resize and prevents background scroll
 */
export function useMobileViewport(isOpen: boolean, chatContainerRef: RefObject<HTMLDivElement | null>) {
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile
    useEffect(() => {
        setIsMobile(window.innerWidth < 768);
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Viewport Logic (Mobile/iOS Fix)
    // REMOVED: JS Height calculation (relying on CSS 100dvh + interactive-widget)
    // Keeping scroll locking below.

    // Body Lock

    // Body Lock
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;

        if (isOpen) {
            html.style.overflow = 'hidden';
            html.style.height = '100%';
            html.style.position = 'fixed';
            html.style.overscrollBehavior = 'none';
            body.style.overflow = 'hidden';
            body.style.height = '100%';
            body.style.position = 'fixed';
            body.style.overscrollBehavior = 'none';
        } else {
            html.style.overflow = '';
            html.style.height = '';
            html.style.position = '';
            html.style.overscrollBehavior = '';
            body.style.overflow = '';
            body.style.height = '';
            body.style.position = '';
            body.style.overscrollBehavior = '';
        }
    }, [isOpen]);

    return { isMobile };
}
