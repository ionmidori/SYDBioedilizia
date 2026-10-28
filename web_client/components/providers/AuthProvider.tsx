'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import {
    User,
    signInAnonymously as firebaseSignInAnonymously,
    onAuthStateChanged,
    onIdTokenChanged,
    GoogleAuthProvider,
    type AuthProvider as FirebaseAuthProvider,
    signOut,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink
} from 'firebase/auth';
import { auth, waitForAuth } from '@/lib/firebase';
import { tokenManager } from '@/lib/auth/token-manager';
import { setAuthCookie, removeAuthCookie } from '@/app/actions/auth-session';
import { queryClient } from '@/lib/query-client';
import { logger } from '@/lib/logger';
import {
    canRedirectHere,
    isPopupUnsupported,
    savePendingRedirect,
    shouldRedirectFirst,
    takePendingRedirect,
} from '@/lib/auth/redirect-login';
import {
    finishRedirectKeepingGuestChats,
    popupKeepingGuestChats,
    redirectKeepingGuestChats,
    signInKeepingGuestChats,
} from '@/lib/auth/guest-claim';
import { GUEST_SESSION_KEY } from '@/lib/chat-session-keys';
import { mapAuthError } from '@/utils/auth-utils';

/**
 * 'redirecting': the browser is leaving for the provider; the login completes
 * when the page loads again (see completeRedirectLogin).
 */
export type SocialLoginOutcome = 'done' | 'redirecting';

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
    loginWithGoogle: () => Promise<SocialLoginOutcome>;
    logout: () => Promise<void>;
    sendMagicLink: (email: string) => Promise<void>;
    completeMagicLink: (emailLink: string, email?: string) => Promise<void>;
    refreshToken: () => Promise<string | null>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Finish a social login started by redirect, on the page the user left from:
 * a guest's chats follow it into the account (lib/auth/guest-claim.ts).
 * No-op when no redirect was started from this tab.
 */
export async function completeRedirectLogin(): Promise<void> {
    if (!takePendingRedirect()) return;
    try {
        await finishRedirectKeepingGuestChats();
    } catch (err) {
        const code = (err as { code?: string })?.code ?? 'unknown';
        console.error('[AuthProvider] Redirect login failed:', code, err);
        window.alert(mapAuthError(code));
    }
}

/**
 * A new reference to the same Firebase user. Firebase changes a `User` in place
 * (reload, account link), so publishing `auth.currentUser` again would be the
 * reference already in state and React would not re-render. Cloning onto the
 * same prototype keeps methods like `getIdToken`.
 */
function cloneUser(user: User): User {
    return Object.assign(Object.create(Object.getPrototypeOf(user)), user);
}

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
    // Whether the user last published was anonymous: Firebase upgrades a linked
    // user in place, so the user object itself no longer tells.
    const publishedAnonymousRef = useRef<boolean | null>(null);

    // A guest who creates an account is linked to it (lib/auth/guest-claim.ts):
    // same uid, so onAuthStateChanged stays silent. The new token tells: publish
    // the registered user and its token (context + server cookie).
    useEffect(() => onIdTokenChanged(auth, async (current) => {
        if (!current || current.isAnonymous || publishedAnonymousRef.current !== true) return;
        publishedAnonymousRef.current = false;
        setUser(cloneUser(current));
        try {
            const token = await current.getIdToken();
            setIdToken(token);
            await setAuthCookie(token);
        } catch (err) {
            console.error('[AuthProvider] Failed to get ID token after account link:', err);
            setError(err as Error);
        }
    }), []);

    useEffect(() => {
        let isMounted = true;
        let hasInitialized = false; // Local flag for first callback

        async function initializeAuth() {
            try {
                // Wait for persistence to be configured
                await waitForAuth();
                logger.debug('[AuthProvider] Firebase persistence ready');

                // Back from a social-login redirect (phones, PWA, in-app browsers).
                await completeRedirectLogin();

                // Subscribe to auth state changes
                const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                    if (!isMounted) return;

                    if (process.env.NODE_ENV === 'development') {
                        logger.debug('[AuthProvider] Auth state changed:', {
                            uid: currentUser?.uid,
                            isAnonymous: currentUser?.isAnonymous,
                        });
                    }

                    publishedAnonymousRef.current = currentUser ? currentUser.isAnonymous : null;
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
                        logger.debug('[AuthProvider] ✅ Initialization complete');
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
                logger.debug('[AuthProvider] Token refreshed');
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
            logger.debug('[AuthProvider] Already have a user, skipping anonymous sign-in');
            return;
        }

        try {
            logger.debug('[AuthProvider] Signing in anonymously...');
            await firebaseSignInAnonymously(auth);
            logger.debug('[AuthProvider] ✅ Anonymous sign-in successful');
        } catch (err) {
            console.error('[AuthProvider] ❌ Anonymous sign-in failed:', err);
            setError(err as Error);
            throw err;
        }
    };

    /**
     * Social login: popup on desktop, redirect on phones / PWA / in-app browsers
     * (and when the popup is refused) — only where redirect is configured, see
     * lib/auth/redirect-login.ts. A guest's chats follow it either way.
     */
    const signInWithProvider = async (provider: FirebaseAuthProvider): Promise<SocialLoginOutcome> => {
        const redirect = async (): Promise<SocialLoginOutcome> => {
            savePendingRedirect();
            await redirectKeepingGuestChats(provider);
            return 'redirecting';
        };

        if (shouldRedirectFirst()) return redirect();
        try {
            await popupKeepingGuestChats(provider);
            return 'done';
        } catch (err) {
            if (isPopupUnsupported(err) && canRedirectHere()) return redirect();
            throw err;
        }
    };

    /**
     * Sign in with Google
     */
    const loginWithGoogle = (): Promise<SocialLoginOutcome> => signInWithProvider(new GoogleAuthProvider());

    /**
     * Sign out
     */
    /**
     * Sign out
     */
    const logout = async (): Promise<void> => {
        try {
            // 1. CLEAR LOCAL STATE IMMEDIATELY (Prevent UI from thinking it's logged in)
            setUser(null);
            setIdToken(null);
            tokenManager.stopMonitoring();

            // 2. Clear TanStack Query cache — prevents cross-user data leakage
            //    on shared/kiosk devices where multiple users share the same tab.
            queryClient.clear();

            // 3. Clear chat session — ensures fresh anonymous session after logout (privacy)
            try {
                window.localStorage.removeItem(GUEST_SESSION_KEY);
            } catch {
                // localStorage may be unavailable (private browsing)
            }

            // 4. Clear Server Session
            await removeAuthCookie();

            // 5. Clear Firebase Auth
            await signOut(auth);

            // 6. Automatic transition back to Anonymous mode
            // This ensures Firestore listeners and background API calls don't fail for lack of UID.
            // NOTE: We call firebaseSignInAnonymously directly instead of the wrapper
            // because setUser(null) above is batched by React — the wrapper's `if (user)`
            // guard would still see the stale user and return early.
            logger.debug('[AuthProvider] Signing in anonymously after logout...');
            await firebaseSignInAnonymously(auth);
            logger.debug('[AuthProvider] ✅ Anonymous sign-in after logout successful');
        } catch (error) {
            console.error('[AuthProvider] Logout error:', error);
            // Even if error, force local state clear
            setUser(null);
            queryClient.clear();
        }
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

        await signInKeepingGuestChats(() => signInWithEmailLink(auth, userEmail, emailLink));
        window.localStorage.removeItem('emailForSignIn');
    };

    /**
     * Refresh token
     *
     * Enhanced with fallback to auth.currentUser to handle race conditions
     * where signInAnonymously has completed but the user state hasn't updated yet.
     */
    // Unified Token Refresher
    const refreshToken = useCallback(async (force = false) => {
        try {
            // ⚡ Use auth.currentUser directly as fallback to state 'user' 
            // to avoid race conditions during initial sign-in
            const currentUser = auth.currentUser || user;
            if (!currentUser) {
                console.warn('[AuthProvider] Cannot refresh token: No user available');
                return null;
            }

            const token = await currentUser.getIdToken(force);
            setIdToken(token);
            await setAuthCookie(token);
            return token;
        } catch (err) {
            console.error('[AuthProvider] Token refresh failed:', err);
            return null;
        }
    }, [user]);

    /**
     * Re-fetches the current user's profile from Firebase Auth (e.g. after an
     * avatar/displayName update via the Admin SDK) and pushes it into context
     * (cloned: `reload()` changes the user in place, see cloneUser).
     */
    const refreshUser = useCallback(async (): Promise<void> => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        try {
            await currentUser.reload();
            setUser(cloneUser(currentUser));
        } catch (err) {
            console.error('[AuthProvider] Failed to refresh user:', err);
        }
    }, []);

    const value: AuthContextValue = {
        user,
        loading,
        isInitialized,
        idToken,
        error,
        isAnonymous: user?.isAnonymous ?? false,
        signInAnonymously,
        loginWithGoogle,
        logout,
        sendMagicLink,
        completeMagicLink,
        refreshToken,
        refreshUser,
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
