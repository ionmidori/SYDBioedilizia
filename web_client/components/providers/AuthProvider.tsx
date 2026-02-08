'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    signInAnonymously as firebaseSignInAnonymously,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    OAuthProvider,
    signOut,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink
} from 'firebase/auth';
import { auth, waitForAuth } from '@/lib/firebase';
import { tokenManager } from '@/lib/auth/token-manager';
import { setAuthCookie, removeAuthCookie } from '@/app/actions/auth-session';

/**
 * AuthContext Interface
 * Provides centralized authentication state and methods
 */
interface AuthContextValue {
    // State
    user: User | null;
    loading: boolean;
    isInitialized: boolean;
    idToken: string | null;
    error: Error | null;
    isAnonymous: boolean;

    // Methods
    signInAnonymously: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    loginWithApple: () => Promise<void>;
    logout: () => Promise<void>;
    sendMagicLink: (email: string) => Promise<void>;
    completeMagicLink: (emailLink: string, email?: string) => Promise<void>;
    refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider Component
 * 
 * Centralized authentication state management with:
 * - Single onAuthStateChanged listener
 * - Initialization state tracking
 * - Strategic anonymous sign-in
 * - Token lifecycle management
 * - Error handling
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);
    const [idToken, setIdToken] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        let hasInitialized = false; // Local flag for first callback

        async function initializeAuth() {
            try {
                // Wait for persistence to be configured
                await waitForAuth();
                console.log('[AuthProvider] Firebase persistence ready');

                // Subscribe to auth state changes
                const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                    if (!isMounted) return;

                    console.log('[AuthProvider] Auth state changed:', {
                        uid: currentUser?.uid,
                        isAnonymous: currentUser?.isAnonymous,
                        email: currentUser?.email
                    });

                    if (currentUser) {
                        // User exists (either anonymous or authenticated)
                        setUser(currentUser);

                        // Get fresh ID token
                        try {
                            const token = await currentUser.getIdToken();
                            setIdToken(token);

                            // Sync cookie with server
                            await setAuthCookie(token);

                            // Start monitoring token expiration
                            tokenManager.startMonitoring(currentUser);
                        } catch (err) {
                            console.error('[AuthProvider] Failed to get ID token:', err);
                            setError(err as Error);
                        }
                    } else {
                        // No user - clear state but DON'T auto sign-in
                        setUser(null);
                        setIdToken(null);
                        tokenManager.stopMonitoring();
                        // Remove server cookie
                        await removeAuthCookie();
                    }

                    // Mark as initialized after first callback (using local flag)
                    if (!hasInitialized) {
                        hasInitialized = true;
                        setIsInitialized(true);
                        console.log('[AuthProvider] ✅ Initialization complete');
                    }

                    setLoading(false);
                }, (authError) => {
                    // Handle auth state change errors
                    console.error('[AuthProvider] Auth state error:', authError);
                    setError(authError);
                    setLoading(false);
                    if (!hasInitialized) {
                        hasInitialized = true;
                        setIsInitialized(true);
                    }
                });

                return unsubscribe;
            } catch (err) {
                console.error('[AuthProvider] Initialization error:', err);
                setError(err as Error);
                setLoading(false);
                setIsInitialized(true);
                return () => { };
            }
        }

        const unsubscribePromise = initializeAuth();

        // Subscribe to token refresh events
        const unsubscribeRefresh = tokenManager.onRefresh(async (newToken) => {
            if (isMounted) {
                console.log('[AuthProvider] Token refreshed');
                setIdToken(newToken);
                // Sync refreshed token
                await setAuthCookie(newToken);
            }
        });

        const unsubscribeError = tokenManager.onError((tokenError) => {
            if (isMounted) {
                console.error('[AuthProvider] Token error, logging out:', tokenError);
                signOut(auth).catch(console.error);
            }
        });

        // Cleanup
        return () => {
            isMounted = false;
            unsubscribePromise.then(unsub => unsub());
            unsubscribeRefresh();
            unsubscribeError();
            tokenManager.stopMonitoring();
        };
    }, []); // Empty deps - run once

    /**
     * Explicit anonymous sign-in
     * Components should call this when they need anonymous access
     */
    const signInAnonymously = async (): Promise<void> => {
        if (!isInitialized) {
            console.warn('[AuthProvider] signInAnonymously called before initialization');
            throw new Error('Auth not initialized');
        }

        if (user) {
            console.log('[AuthProvider] Already have a user, skipping anonymous sign-in');
            return;
        }

        try {
            console.log('[AuthProvider] Signing in anonymously...');
            await firebaseSignInAnonymously(auth);
            console.log('[AuthProvider] ✅ Anonymous sign-in successful');
        } catch (err) {
            console.error('[AuthProvider] ❌ Anonymous sign-in failed:', err);
            setError(err as Error);
            throw err;
        }
    };

    /**
     * Sign in with Google
     */
    const loginWithGoogle = async (): Promise<void> => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };

    /**
     * Sign in with Apple
     */
    const loginWithApple = async (): Promise<void> => {
        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        await signInWithPopup(auth, provider);
    };

    /**
     * Sign out
     */
    const logout = async (): Promise<void> => {
        await removeAuthCookie();
        await signOut(auth);
    };

    /**
     * Send magic link
     */
    const sendMagicLink = async (email: string): Promise<void> => {
        const actionCodeSettings = {
            url: window.location.origin + '/auth/verify',
            handleCodeInApp: true,
        };

        await sendSignInLinkToEmail(auth, email, actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', email);
    };

    /**
     * Complete magic link sign-in
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

    /**
     * Refresh token
     */
    const refreshToken = async (): Promise<string | null> => {
        if (!user) return null;

        try {
            const token = await user.getIdToken(true);
            setIdToken(token);
            return token;
        } catch (err) {
            console.error('[AuthProvider] Token refresh failed:', err);
            return null;
        }
    };

    const value: AuthContextValue = {
        user,
        loading,
        isInitialized,
        idToken,
        error,
        isAnonymous: user?.isAnonymous ?? false,
        signInAnonymously,
        loginWithGoogle,
        loginWithApple,
        logout,
        sendMagicLink,
        completeMagicLink,
        refreshToken,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export function useAuthContext(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuthContext must be used within AuthProvider');
    }
    return context;
}
