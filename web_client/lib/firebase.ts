import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';

/**
 * Firebase Client SDK Configuration
 * Used for client-side authentication and ID Token retrieval
 */

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);

// Configure persistence (localStorage for reliability)
let authReadyResolve: () => void = () => { };
const authReadyPromise = new Promise<void>((resolve) => {
    authReadyResolve = resolve;
});

if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence)
        .then(() => {
            console.log('[Firebase] ✅ Persistence configured');
            authReadyResolve?.();
        })
        .catch((error) => {
            console.error('[Firebase] Failed to set persistence:', error);
            authReadyResolve?.(); // Resolve anyway to prevent hanging
        });
} else {
    // Server-side, resolve immediately
    authReadyResolve?.();
}

/**
 * Wait for Firebase Auth persistence to be configured
 * AuthProvider should await this before setting up listeners
 */
export const waitForAuth = (): Promise<void> => authReadyPromise;

// Initialize Firestore
import { getFirestore } from 'firebase/firestore';
const db = getFirestore(app);

// Initialize Storage
import { getStorage } from 'firebase/storage';
const storage = getStorage(app);

// Initialize App Check (with protection against multiple initializations)
let appCheck: AppCheck | undefined;

if (typeof window !== 'undefined') {
    if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK !== 'true') {
        console.warn('[Firebase] ⚠️ App Check is DISABLED (NEXT_PUBLIC_ENABLE_APP_CHECK != true)');
    } else {
        const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (!siteKey) {
            console.error('[Firebase] ❌ App Check initialization FAILED: NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing!');
        } else {
            try {
                // @ts-ignore - Check if already initialized via global flag
                if (!window._firebaseAppCheckInitialized) {
                    appCheck = initializeAppCheck(app, {
                        provider: new ReCaptchaV3Provider(siteKey),
                        isTokenAutoRefreshEnabled: true
                    });
                    // @ts-ignore - Mark as initialized
                    window._firebaseAppCheckInitialized = true;
                    console.log('[Firebase] ✅ App Check initialized with siteKey:', siteKey.substring(0, 5) + '...');
                } else {
                    console.log('[Firebase] ✅ App Check already initialized (skipped)');
                }
            } catch (error) {
                console.error('[Firebase] ❌ App Check initialization error:', error);
            }
        }
    }
}

export { app, auth, db, storage, appCheck };
export type { Auth };

