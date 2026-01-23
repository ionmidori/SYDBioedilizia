'use client';

import { useEffect, useState } from 'react';
import {
    User,
    signInAnonymously,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    OAuthProvider,
    signOut,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink
} from 'firebase/auth';
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

    /**
     * Sign in with Google using popup
     * @throws {Error} If sign-in fails
     */
    const loginWithGoogle = async (): Promise<void> => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };

    /**
     * Sign in with Apple using popup
     * @throws {Error} If sign-in fails
     */
    const loginWithApple = async (): Promise<void> => {
        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        await signInWithPopup(auth, provider);
    };

    /**
     * Sign out current user (reverts to anonymous)
     * @throws {Error} If sign-out fails
     */
    const logout = async (): Promise<void> => {
        await signOut(auth);
    };

    /**
     * Send a magic link (passwordless) to user's email
     * @param email - User's email address
     * @throws {Error} If sending fails
     */
    const sendMagicLink = async (email: string): Promise<void> => {
        const actionCodeSettings = {
            url: window.location.origin + '/auth/verify',
            handleCodeInApp: true,
        };

        await sendSignInLinkToEmail(auth, email, actionCodeSettings);
        // Store email in localStorage for verification
        window.localStorage.setItem('emailForSignIn', email);
    };

    /**
     * Complete magic link sign-in
     * @param emailLink - The link from the user's email
     * @param email - Optional email (will use stored if not provided)
     * @throws {Error} If verification fails
     */
    const completeMagicLink = async (emailLink: string, email?: string): Promise<void> => {
        if (!isSignInWithEmailLink(auth, emailLink)) {
            throw new Error('Invalid email link');
        }

        const userEmail = email || window.localStorage.getItem('emailForSignIn');
        if (!userEmail) {
            throw new Error('Email not found');
        }

        await signInWithEmailLink(auth, userEmail, emailLink);
        window.localStorage.removeItem('emailForSignIn');
    };

    return {
        user,
        loading,
        idToken,
        refreshToken,
        isAnonymous: user?.isAnonymous ?? true,
        loginWithGoogle,
        loginWithApple,
        logout,
        sendMagicLink,
        completeMagicLink,
    };
}
