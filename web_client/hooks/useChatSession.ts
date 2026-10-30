import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useGuestClaim } from '@/hooks/use-guest-claim';
import { userChatQuery } from '@/hooks/use-user-chat';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';
import { GUEST_SESSION_KEY } from '@/lib/chat-session-keys';

interface UseChatSessionReturn {
    /**
     * Session key used by the backend, Firestore history and `useChat({ id })`.
     * `null` until it is known: the user's chat is being asked for, or the
     * guest id is being read. Nothing can be sent until then.
     */
    sessionId: string | null;
    /** The signed-in user's chat (also the project its rooms belong to); `null` for a guest. */
    userChatId: string | null;
    /** Why the user's chat could not be had (the chat stays without an id). */
    userChatError: Error | null;
    /**
     * Ask the backend for the user's chat again — the chat this page had is no
     * longer theirs (merged, or a stale id). Resolves to the chat it gives now.
     */
    refreshUserChat: () => Promise<string | null>;
    /**
     * Mint a fresh guest session id.
     *
     * Called by the provider on logout. It deliberately does NOT clear the AI
     * SDK messages: `setMessages` comes from `useChat`, which depends on the
     * transport, which depends on `sessionId` — owning it here would close the
     * loop. The provider clears the messages and calls this in the same tick.
     */
    resetToNewGuestSession: () => void;
}

/**
 * Own the chat session identity (Phase 139: one chat per user).
 *
 * - A signed-in user always chats in the chat the backend gives
 *   (GET /api/me/chat): the client never picks or remembers an id of its own.
 * - A guest (no user, or a Firebase anonymous user) keeps a persistent id
 *   chosen in this browser; at login the guest claim brings that chat into
 *   the account's (lib/auth/guest-claim.ts).
 */
export function useChatSession(): UseChatSessionReturn {
    const { user } = useAuth();
    const claim = useGuestClaim();
    const queryClient = useQueryClient();
    const registeredUid = user && !user.isAnonymous ? user.uid : null;

    // -- STABLE SESSION ID (L3 Persistent Guest) --
    const [stableGuestId, setStableGuestId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            let id = localStorage.getItem(GUEST_SESSION_KEY);
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem(GUEST_SESSION_KEY, id);
            }
            const timerId = setTimeout(() => {
                setStableGuestId(id);
            }, 0);
            return () => clearTimeout(timerId);
        }
    }, []);

    // -- THE USER'S CHAT --
    // Not while the guest's chats are moving into the account: the backend has
    // not settled the account's chat yet, and asking now would create an empty
    // one next to them.
    const userChat = useQuery({
        ...userChatQuery(registeredUid ?? ''),
        enabled: registeredUid !== null && claim.status !== 'pending',
    });
    const userChatId = registeredUid ? userChat.data?.chat_id ?? null : null;

    // Anonymous Firebase users keep using stableGuestId to prevent useChat reset
    // when signInAnonymously() completes mid-message (would wipe all messages).
    const sessionId = registeredUid ? userChatId : stableGuestId;

    // -- GUEST CLAIM: the guest's chats just became the account's --
    // The claim asked for the user's chat again (openAfterLogin); the store goes
    // back to idle for the message waiting for the login (GlobalAuthListener).
    useEffect(() => {
        if (claim.status !== 'done' || !registeredUid) return;
        const timerId = setTimeout(() => guestClaimStore.reset(), 0);
        return () => clearTimeout(timerId);
    }, [claim.status, registeredUid]);

    const refreshUserChat = useCallback(async (): Promise<string | null> => {
        if (!registeredUid) return null;
        const chat = await queryClient.fetchQuery({ ...userChatQuery(registeredUid), staleTime: 0 });
        return chat.chat_id;
    }, [queryClient, registeredUid]);

    const resetToNewGuestSession = useCallback(() => {
        const freshId = crypto.randomUUID();
        // Persist it: AuthProvider.logout() has just removed the key, so without
        // this the post-logout session exists only in memory and a reload mints a
        // different id — the conversation would be written under a session no
        // reload can reach, and the chat would come back empty.
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(GUEST_SESSION_KEY, freshId);
            } catch {
                // localStorage may be unavailable (private browsing)
            }
        }
        setStableGuestId(freshId);
    }, []);

    return {
        sessionId,
        userChatId,
        userChatError: registeredUid ? userChat.error : null,
        refreshUserChat,
        resetToNewGuestSession,
    };
}
