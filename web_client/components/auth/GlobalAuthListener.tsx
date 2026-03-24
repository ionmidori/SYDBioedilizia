'use client';

import { useState, useEffect, useRef } from 'react';
import { AuthDialog } from './AuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { useChatContext } from '@/hooks/useChatContext';

/**
 * GlobalAuthListener
 *
 * Singleton component (mounted inside ChatProvider) that:
 * 1. Listens for `OPEN_LOGIN_MODAL` events from anywhere in the app.
 * 2. Captures `pendingMessage` from the event detail (set by LoginRequest).
 * 3. After the user authenticates (anonymous → verified), automatically
 *    re-sends the pending message so the conversation continues seamlessly.
 */
export function GlobalAuthListener() {
    const [open, setOpen] = useState(false);
    const [redirectOnLogin, setRedirectOnLogin] = useState(true);
    const [pendingMessage, setPendingMessage] = useState('');

    const { user } = useAuth();
    const { sendMessage } = useChatContext();

    // Track the previous user state to detect anonymous → authenticated transitions.
    const prevUserRef = useRef(user);

    // ── Listen for OPEN_LOGIN_MODAL ──────────────────────────────────────────
    useEffect(() => {
        const handleOpen = (e: Event) => {
            const customEvent = e as CustomEvent<{
                redirectOnLogin?: boolean;
                pendingMessage?: string;
            }>;

            if (customEvent.detail) {
                setRedirectOnLogin(customEvent.detail.redirectOnLogin ?? false);
                if (typeof customEvent.detail.pendingMessage === 'string') {
                    setPendingMessage(customEvent.detail.pendingMessage);
                }
            } else {
                // Triggered from header / non-chat context — redirect is fine
                setRedirectOnLogin(true);
            }

            setOpen(true);
        };

        window.addEventListener('OPEN_LOGIN_MODAL', handleOpen);
        return () => window.removeEventListener('OPEN_LOGIN_MODAL', handleOpen);
    }, []);

    // ── Re-send pending message after successful auth ────────────────────────
    // Detects when the user transitions from anonymous/guest → authenticated.
    // Waits 1.5 s for sessionId + Firestore to stabilise before re-sending.
    useEffect(() => {
        const wasGuest = !prevUserRef.current || prevUserRef.current.isAnonymous;
        const isNowAuth = !!user && !user.isAnonymous;

        if (wasGuest && isNowAuth && pendingMessage) {
            const timer = setTimeout(() => {
                sendMessage(pendingMessage);
                setPendingMessage('');
            }, 1500);
            return () => clearTimeout(timer);
        }

        prevUserRef.current = user;
    }, [user, pendingMessage, sendMessage]);

    return (
        <AuthDialog
            open={open}
            onOpenChange={setOpen}
            redirectOnLogin={redirectOnLogin}
        />
    );
}
