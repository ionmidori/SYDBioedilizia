'use client';

import { useEffect, useState } from 'react';
import { User, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * Centralized Auth Hook with Automatic Anonymous Sign-In
 * 
 * Best Practices:
 * - Automatically signs in anonymous users on mount
 * - Listens to auth state changes (handles upgrades to email/Google)
 * - Provides fresh ID tokens for API calls
 * - Handles token refresh automatically via Firebase SDK
 */
export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [idToken, setIdToken] = useState<string | null>(null);

    useEffect(() => {
        // Subscribe to auth state changes
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // User exists (either anonymous or authenticated)
                setUser(currentUser);

                // Get fresh ID token for API calls
                try {
                    const token = await currentUser.getIdToken();
                    setIdToken(token);
                } catch (error) {
                    console.error('[useAuth] Failed to get ID token:', error);
                }

                setLoading(false);
            } else {
                // No user - sign in anonymously
                console.log('[useAuth] No user found, signing in anonymously...');
                try {
                    const result = await signInAnonymously(auth);
                    setUser(result.user);

                    const token = await result.user.getIdToken();
                    setIdToken(token);

                    console.log('[useAuth] ✅ Anonymous sign-in successful:', result.user.uid);
                } catch (error) {
                    console.error('[useAuth] ❌ Anonymous sign-in failed:', error);
                }

                setLoading(false);
            }
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // Helper to get a fresh token (e.g., if expired)
    const refreshToken = async (): Promise<string | null> => {
        if (!user) return null;

        try {
            const token = await user.getIdToken(true); // Force refresh
            setIdToken(token);
            return token;
        } catch (error) {
            console.error('[useAuth] Token refresh failed:', error);
            return null;
        }
    };

    return {
        user,
        loading,
        idToken,
        refreshToken,
        isAnonymous: user?.isAnonymous ?? true,
    };
}
