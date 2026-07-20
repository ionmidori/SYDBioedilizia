import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

const GUEST_SESSION_KEY = 'chatSessionId';
const lastProjectKey = (uid: string) => `last_active_project:${uid}`;

interface UseChatSessionReturn {
    /** Session key used by the backend, Firestore history and `useChat({ id })`. */
    sessionId: string;
    /** `null` means the global/landing context. */
    currentProjectId: string | null;
    setCurrentProjectId: (id: string | null) => void;
    /**
     * Drop the current project and mint a fresh guest session id.
     *
     * Called by the provider on logout. It deliberately does NOT clear the AI
     * SDK messages: `setMessages` comes from `useChat`, which depends on the
     * transport, which depends on `sessionId` — owning it here would close the
     * loop. The provider clears the messages and calls this in the same tick.
     */
    resetToNewGuestSession: () => void;
}

/**
 * Own the chat session identity: the persistent guest id, the derived
 * sessionId and the "last active project" persistence.
 *
 * Note: `hooks/useSessionId.ts` covers a different case (one-shot read that
 * also honours `activeProjectId`, used outside the chat provider) and is
 * intentionally left untouched — the overlap is known.
 */
export function useChatSession(): UseChatSessionReturn {
    const { user, isInitialized } = useAuth();

    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

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

    // Derived Session ID
    // Anonymous Firebase users keep using stableGuestId to prevent useChat reset
    // when signInAnonymously() completes mid-message (would wipe all messages).
    const sessionId = useMemo(() => {
        if (!user || user.isAnonymous) return stableGuestId || 'guest-loading';
        return currentProjectId || `global-${user.uid}`;
    }, [user, currentProjectId, stableGuestId]);

    // -- PERSISTENCE: Save/Restore Last Project --
    useEffect(() => {
        if (isInitialized && user && !user.isAnonymous && !currentProjectId) {
            const lastId = localStorage.getItem(lastProjectKey(user.uid));
            if (lastId) {
                logger.debug('[ChatProvider] Restoring last active project:', lastId);
                const timerId = setTimeout(() => {
                    setCurrentProjectId(lastId);
                }, 0);
                return () => clearTimeout(timerId);
            }
        }
    }, [isInitialized, user, currentProjectId]);

    // Save Effect
    useEffect(() => {
        if (user && !user.isAnonymous && currentProjectId) {
            localStorage.setItem(lastProjectKey(user.uid), currentProjectId);
        }
    }, [user, currentProjectId]);

    const resetToNewGuestSession = useCallback(() => {
        setCurrentProjectId(null);    // prevent backend receiving stale projectId
        setStableGuestId(crypto.randomUUID());
    }, []);

    return { sessionId, currentProjectId, setCurrentProjectId, resetToNewGuestSession };
}
