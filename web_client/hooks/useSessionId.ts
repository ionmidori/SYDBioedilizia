import { useState } from 'react';

/**
 * Custom hook for managing chat session ID with localStorage persistence
 * Extracted from ChatWidget.tsx (lines 27-40)
 */
export function useSessionId() {
    const [sessionId] = useState(() => {
        if (typeof window === 'undefined') return crypto.randomUUID();

        // 1. Priority: Project Context (Logged in User)
        const activeProjectId = localStorage.getItem('activeProjectId');
        if (activeProjectId) {
            console.log('[SessionID] Restored Project Context:', activeProjectId);
            return activeProjectId;
        }

        // 2. Fallback: Anonymous Session
        const stored = localStorage.getItem('chatSessionId');
        if (stored) {
            console.log('[SessionID] Restored anonymous session:', stored);
            return stored;
        }

        // crypto.randomUUID() provides 122 bits of cryptographic randomness,
        // preventing session ID brute-force that was possible with Math.random().
        const newSessionId = crypto.randomUUID();
        localStorage.setItem('chatSessionId', newSessionId);
        console.log('[SessionID] Created new session:', newSessionId);
        return newSessionId;
    });

    return sessionId;
}
