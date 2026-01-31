import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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

// Note: App Check is initialized globally in AppCheckProvider.tsx
export { app, auth, db, storage };
export type { Auth };

