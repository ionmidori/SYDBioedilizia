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
    useEffect(() => {
        // Only run body lock and viewport height adjustments if chat is fully open
        // If it's closed OR minimized, we should release the viewport/body
        if (!isOpen) return;

        const handleResize = () => {
            if (window.visualViewport && window.innerWidth < 768) {
                const h = window.visualViewport.height;
                if (chatContainerRef.current) chatContainerRef.current.style.height = `${h}px`;
                window.scrollTo(0, 0); // iOS Fix
            } else {
                if (chatContainerRef.current) chatContainerRef.current.style.height = '';
            }
        };

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
            window.visualViewport.addEventListener('scroll', handleResize);
            handleResize();
        }
        window.addEventListener('resize', handleResize);

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleResize);
                window.visualViewport.removeEventListener('scroll', handleResize);
            }
            window.removeEventListener('resize', handleResize);
        };
    }, [isOpen, chatContainerRef]);

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
