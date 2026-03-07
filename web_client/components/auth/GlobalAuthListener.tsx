'use client';

import { useState, useEffect } from 'react';
import { AuthDialog } from './AuthDialog';

/**
 * GlobalAuthListener
 * 
 * A singleton-like component that listens for the 'OPEN_LOGIN_MODAL' event.
 * Ensures the login dialog is accessible from any page (Landing, Dashboard, Projects)
 * without needing to mount it locally in every header.
 */
export function GlobalAuthListener() {
    const [open, setOpen] = useState(false);
    const [redirectOnLogin, setRedirectOnLogin] = useState(true);

    useEffect(() => {
        const handleOpen = (e: Event) => {
            console.log('[GlobalAuthListener] 🟢 Event received: OPEN_LOGIN_MODAL');
            
            const customEvent = e as CustomEvent;

            // Extract options from event detail if provided
            if (customEvent.detail) {
                if (typeof customEvent.detail.redirectOnLogin === 'boolean') {
                    setRedirectOnLogin(customEvent.detail.redirectOnLogin);
                }
            } else {
                // Default fallback
                setRedirectOnLogin(true);
            }

            setOpen(true);
        };

        window.addEventListener('OPEN_LOGIN_MODAL', handleOpen);
        return () => window.removeEventListener('OPEN_LOGIN_MODAL', handleOpen);
    }, []);

    return (
        <AuthDialog
            open={open}
            onOpenChange={setOpen}
            redirectOnLogin={redirectOnLogin}
        />
    );
}
