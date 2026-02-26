import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserPreferences } from '@/lib/validation/profile-schema';
import { usersApi } from '@/lib/users-api';

/**
 * Custom hook for managing user preferences with real-time sync
 * Automatically saves changes to Firestore and provides optimistic updates
 */
export function useUserPreferences() {
    const { user } = useAuth();
    const [preferences, setPreferences] = useState<UserPreferences>({
        notifications: {
            email: true,
            quoteReady: true,
        },
        ui: {
            sidebarCollapsed: false,
        },
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Subscribe to preferences changes
    useEffect(() => {
        if (!user?.uid) {
            setIsLoading(false);
            return;
        }

        // ADR-001: Documented onSnapshot exception. Data is user-owned (users/{uid}/...) and read-only.
        // All writes are delegated to the backend via usersApi.updatePreferences().
        // See: docs/ADR/ADR-001-realtime-onSnapshot-vs-SSE.md
        const preferencesRef = doc(db, 'users', user.uid, 'preferences', 'general');

        const unsubscribe = onSnapshot(
            preferencesRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    setPreferences(snapshot.data() as UserPreferences);
                }
                setIsLoading(false);
                setError(null);
            },
            (err) => {
                console.error('[useUserPreferences] Error:', err);
                setError('Errore nel caricamento delle preferenze');
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user?.uid]);

    // Update preferences (optimistic update + Backend API write)
    const updatePreferences = async (updates: Partial<UserPreferences>) => {
        if (!user?.uid) {
            setError('Utente non autenticato');
            return;
        }

        // Optimistic update
        setPreferences(prev => ({
            notifications: {
                ...prev.notifications,
                ...updates.notifications,
            },
            ui: updates.ui ? {
                ...prev.ui,
                ...updates.ui,
            } : prev.ui,
        }));

        try {
            await usersApi.updatePreferences(updates);
            setError(null);
        } catch (err: any) {
            console.error('[useUserPreferences] Update error:', err);
            setError('Errore nel salvataggio delle preferenze');
            // Revert optimistic update by re-fetching
            // The snapshot listener will handle the revert automatically
        }
    };

    return {
        preferences,
        updatePreferences,
        isLoading,
        error,
    };
}
