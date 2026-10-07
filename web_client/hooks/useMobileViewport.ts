import { useState, useEffect, useCallback, RefObject } from 'react';

/**
 * Custom hook for mobile viewport handling, keyboard detection, and body scroll locking.
 *
 * Uses the `visualViewport` API to detect when the virtual keyboard
 * opens/closes on iOS and Android — eliminating arbitrary setTimeout hacks.
 */
export function useMobileViewport(isOpen: boolean, chatContainerRef: RefObject<HTMLDivElement | null>, isInline: boolean = false) {
    const [isMobile, setIsMobile] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    // ─── Mobile detection ────────────────────────────────────────────────────
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        
        // Wrap in timeout to avoid sync setState warning in effect body
        const timerId = setTimeout(handleResize, 0);
        
        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(timerId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // ─── visualViewport keyboard detection ───────────────────────────────────
    // When the virtual keyboard opens, visualViewport.height shrinks while
    // window.innerHeight stays the same (or changes less on some browsers).
    // A ratio < 0.85 reliably indicates keyboard presence on both iOS & Android.
    const handleViewportResize = useCallback(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const ratio = vv.height / window.innerHeight;
        const isKeyboard = ratio < 0.85;
        const kbHeight = isKeyboard ? Math.round(window.innerHeight - vv.height) : 0;

        setKeyboardOpen(isKeyboard);
        setKeyboardHeight(kbHeight);
    }, []);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        vv.addEventListener('resize', handleViewportResize);
        return () => vv.removeEventListener('resize', handleViewportResize);
    }, [handleViewportResize]);

    // ─── Body lock (when fullscreen chat is open on mobile) ──────────────────
    useEffect(() => {
        if (!isOpen || isInline) return;

        const html = document.documentElement;
        const body = document.body;

        html.style.overflow = 'hidden';
        html.style.overscrollBehavior = 'none';
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';
        // Removed position: fixed to avoid scroll jumps
        // Removed pointerEvents: none as it's dangerous for SPA navigation

        // Released on close AND on unmount: the widget is mounted per page, so a
        // client-side navigation (e.g. the chat's "Informativa Privacy" link) unmounts
        // it while open — without this the next page is left unscrollable.
        return () => {
            html.style.overflow = '';
            html.style.overscrollBehavior = '';
            body.style.overflow = '';
            body.style.overscrollBehavior = '';
        };
    }, [isOpen, isInline]);

    return { isMobile, keyboardOpen, keyboardHeight };
}
