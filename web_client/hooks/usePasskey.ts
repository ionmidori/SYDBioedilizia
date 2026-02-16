import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * WebAuthn Passkeys Hook
 * 
 * Implements FIDO2/WebAuthn for biometric authentication.
 * 
 * Best Practices:
 * - Feature detection before use
 * - Clear user feedback for cancellations
 * - Graceful fallback to other auth methods
 */

interface PasskeySupport {
    isSupported: boolean;
    isPlatformAuthenticator: boolean;
}

export function usePasskey() {
    const { user, idToken } = useAuth();
    const [isRegistering, setIsRegistering] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    /**
     * Check if Passkeys are supported on this device.
     */
    const checkSupport = useCallback(async (): Promise<PasskeySupport> => {
        if (!window.PublicKeyCredential) {
            return { isSupported: false, isPlatformAuthenticator: false };
        }

        const isPlatform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

        return {
            isSupported: true,
            isPlatformAuthenticator: isPlatform
        };
    }, []);

    /**
     * Register a new passkey for the current user.
     * 
     * Flow:
     * 1. Get registration options from backend (includes challenge)
     * 2. Call navigator.credentials.create()
     * 3. Send credential to backend for storage
     */
    const registerPasskey = useCallback(async () => {
        if (!user || !idToken) {
            throw new Error('User must be authenticated to register passkey');
        }

        setIsRegistering(true);

        try {
            // Get registration options from backend
            const { fetchWithAuth } = await import('@/lib/api-client');
            const optionsRes = await fetchWithAuth('/api/passkey/register/options', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // Authorization header injected automatically
                },
                body: JSON.stringify({ user_id: user.uid })
            });

            if (!optionsRes.ok) {
                const errData = await optionsRes.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to get registration options');
            }

            const options = await optionsRes.json();

            // Convert base64url to ArrayBuffer for WebAuthn
            const publicKey = {
                ...options,
                challenge: base64urlToBuffer(options.challenge),
                user: {
                    ...options.user,
                    id: base64urlToBuffer(options.user.id)
                }
            };

            // Create credential
            const credential = await navigator.credentials.create({
                publicKey
            }) as PublicKeyCredential;

            if (!credential) {
                throw new Error('No credential created');
            }

            // Send credential to backend
            const verifyRes = await fetchWithAuth('/api/passkey/register/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // Authorization header injected automatically
                },
                body: JSON.stringify({
                    id: credential.id,
                    rawId: bufferToBase64url(credential.rawId),
                    response: {
                        attestationObject: bufferToBase64url(
                            (credential.response as AuthenticatorAttestationResponse).attestationObject
                        ),
                        clientDataJSON: bufferToBase64url(credential.response.clientDataJSON)
                    },
                    type: credential.type
                })
            });

            if (!verifyRes.ok) {
                throw new Error('Failed to verify credential');
            }

            return await verifyRes.json();

        } catch (error: any) {
            console.error('[usePasskey] Registration failed:', error);

            // User cancelled
            if (error.name === 'NotAllowedError') {
                throw new Error('Registrazione annullata');
            }

            throw error;
        } finally {
            setIsRegistering(false);
        }
    }, [user, idToken]);

    /**
     * Authenticate using an existing passkey.
     * 
     * Flow:
     * 1. Get authentication options from backend
     * 2. Call navigator.credentials.get()
     * 3. Send assertion to backend for verification
     * 4. Receive JWT token
     * 
     * @param userId - Optional. If omitted, browser will discover credentials automatically (Resident Keys)
     */
    const authenticateWithPasskey = useCallback(async (userId?: string) => {
        setIsAuthenticating(true);

        try {
            // Get authentication options
            const { fetchWithAuth } = await import('@/lib/api-client');
            const optionsRes = await fetchWithAuth('/api/passkey/authenticate/options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId || null }),  // ✅ Null for Resident Keys
                skipAuth: true // Login is public
            });

            if (!optionsRes.ok) {
                const errData = await optionsRes.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to get authentication options');
            }

            const options = await optionsRes.json();

            // Convert challenge
            const publicKey = {
                ...options,
                challenge: base64urlToBuffer(options.challenge),
                // ✅ allowCredentials may be empty for Resident Keys
                allowCredentials: options.allowCredentials?.length > 0
                    ? options.allowCredentials.map((cred: any) => ({
                        ...cred,
                        id: base64urlToBuffer(cred.id)
                    }))
                    : undefined  // Undefined = browser discovers credentials
            };

            // Get credential
            const assertion = await navigator.credentials.get({
                publicKey
            }) as PublicKeyCredential;

            if (!assertion) {
                throw new Error('No assertion returned');
            }

            // Verify with backend
            const verifyRes = await fetchWithAuth('/api/passkey/authenticate/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: assertion.id,
                    rawId: bufferToBase64url(assertion.rawId),
                    response: {
                        authenticatorData: bufferToBase64url(
                            (assertion.response as AuthenticatorAssertionResponse).authenticatorData
                        ),
                        clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
                        signature: bufferToBase64url(
                            (assertion.response as AuthenticatorAssertionResponse).signature
                        ),
                        // ✅ Include userHandle for Resident Keys
                        userHandle: (assertion.response as AuthenticatorAssertionResponse).userHandle
                            ? bufferToBase64url((assertion.response as AuthenticatorAssertionResponse).userHandle!)
                            : null
                    },
                    type: assertion.type
                }),
                skipAuth: true // Login verification is public
            });

            if (!verifyRes.ok) {
                throw new Error('Authentication failed');
            }

            const result = await verifyRes.json();

            // Sign in with the custom token returned by backend
            if (result.token) {
                const { signInWithCustomToken } = await import('firebase/auth');
                const { auth } = await import('@/lib/firebase');
                await signInWithCustomToken(auth, result.token);
            }

            return result;

        } catch (error: any) {
            console.error('[usePasskey] Authentication failed:', error);

            if (error.name === 'NotAllowedError') {
                throw new Error('Autenticazione annullata');
            }

            throw error;
        } finally {
            setIsAuthenticating(false);
        }
    }, []);

    return {
        checkSupport,
        registerPasskey,
        authenticateWithPasskey,
        isRegistering,
        isAuthenticating
    };
}

// Utility functions for base64url encoding (WebAuthn uses base64url, not base64)

function base64urlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
