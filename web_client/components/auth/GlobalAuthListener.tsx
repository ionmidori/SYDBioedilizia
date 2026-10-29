'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AuthDialog } from './AuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { useChatContext } from '@/hooks/useChatContext';
import { useGuestClaim } from '@/hooks/use-guest-claim';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';
import { pendingMessageStore } from '@/lib/auth/pending-message';

/** How the last claim of the guest's chats ended, as seen by this listener. */
type ClaimOutcome =
    | { kind: 'none' }
    /** The chat opens `sessionId` (null: nothing to open, any session will do). */
    | { kind: 'opened'; sessionId: string | null }
    | { kind: 'failed' };

/**
 * GlobalAuthListener
 *
 * Singleton component (mounted inside ChatProvider) that:
 * 1. Listens for `OPEN_LOGIN_MODAL` events from anywhere in the app.
 * 2. Keeps the `pendingMessage` of the event (set by LoginRequest: the message
 *    the guest confirmed) in pendingMessageStore.
 * 3. Sends it again once the guest has signed in in this tab AND its chats
 *    have followed it (lib/auth/guest-claim.ts), in the chat the claim opened —
 *    so the confirmed render or quote starts in the same conversation (Phase
 *    138 PR-6). A claim that failed keeps the message until "Riprova" works;
 *    closing the notice drops it: it belongs to the guest's chat.
 */
export function GlobalAuthListener() {
    const [open, setOpen] = useState(false);
    const pendingMessage = useSyncExternalStore(pendingMessageStore.subscribe, pendingMessageStore.get, () => '');

    const { user } = useAuth();
    const claim = useGuestClaim();
    const { sessionId, sendMessage } = useChatContext();

    // Read from the store as it changes: useChatSession turns 'done' back into
    // 'idle' as soon as it opens the chat, so a render may never see 'done'.
    const outcomeRef = useRef<ClaimOutcome>({ kind: 'none' });
    useEffect(() => {
        const record = () => {
            const state = guestClaimStore.get();
            if (state.status === 'done') {
                outcomeRef.current = { kind: 'opened', sessionId: state.openSessionId };
            } else if (state.status === 'error') {
                outcomeRef.current = { kind: 'failed' };
            } else if (state.status === 'idle' && outcomeRef.current.kind === 'failed') {
                outcomeRef.current = { kind: 'none' };
                pendingMessageStore.clear();
            }
        };
        record(); // a claim that ended before this mounted
        return guestClaimStore.subscribe(record);
    }, []);

    // ── Listen for OPEN_LOGIN_MODAL ──────────────────────────────────────────
    useEffect(() => {
        const handleOpen = (e: Event) => {
            const customEvent = e as CustomEvent<{ pendingMessage?: string } | null>;

            if (typeof customEvent.detail?.pendingMessage === 'string') {
                pendingMessageStore.set(customEvent.detail.pendingMessage);
            }

            setOpen(true);
        };

        window.addEventListener('OPEN_LOGIN_MODAL', handleOpen);
        return () => window.removeEventListener('OPEN_LOGIN_MODAL', handleOpen);
    }, []);

    // ── Send the pending message once the login has settled ──────────────────
    useEffect(() => {
        if (!pendingMessage || !user || user.isAnonymous) return;
        // pending: the chats are moving; done: the chat is opening them; error: waiting for "Riprova".
        if (claim.status !== 'idle') return;
        // A login made in this tab always settles a claim first. One finished
        // elsewhere (magic link in another tab) does not tell which chat the
        // message belongs to: drop it, or a later login would send it into an
        // unrelated conversation.
        const outcome = outcomeRef.current;
        if (outcome.kind !== 'opened') {
            pendingMessageStore.clear();
            return;
        }
        if (outcome.sessionId && sessionId !== outcome.sessionId) return;

        outcomeRef.current = { kind: 'none' };
        pendingMessageStore.clear();
        void sendMessage(pendingMessage);
    }, [user, claim.status, sessionId, pendingMessage, sendMessage]);

    return (
        <AuthDialog
            open={open}
            onOpenChange={setOpen}
        />
    );
}
