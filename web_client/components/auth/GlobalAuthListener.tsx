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
        const handleOpen = (e: any) => {
            console.log('[GlobalAuthListener] 🟢 Event received: OPEN_LOGIN_MODAL');

            // Extract options from event detail if provided
            if (e.detail) {
                if (typeof e.detail.redirectOnLogin === 'boolean') {
                    setRedirectOnLogin(e.detail.redirectOnLogin);
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
