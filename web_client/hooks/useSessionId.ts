import { useState } from 'react';

/**
 * Custom hook for managing chat session ID with localStorage persistence
 * Extracted from ChatWidget.tsx (lines 27-40)
 */
export function useSessionId() {
    const [sessionId] = useState(() => {
        if (typeof window === 'undefined') return `session-${Date.now()}`;

        const stored = localStorage.getItem('chatSessionId');
        if (stored) {
            console.log('[SessionID] Restored from localStorage:', stored);
            return stored;
        }

        const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        localStorage.setItem('chatSessionId', newSessionId);
        console.log('[SessionID] Created new session:', newSessionId);
        return newSessionId;
    });

    return sessionId;
}
