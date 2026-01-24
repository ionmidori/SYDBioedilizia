import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
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

// Initialize App Check (reCAPTCHA v3) - Feature Flag Controlled
// Set NEXT_PUBLIC_ENABLE_APP_CHECK=true to activate bot protection
let appCheck: any = null;
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

    if (!siteKey) {
        console.warn('[Firebase] App Check enabled but NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing');
    } else {
        try {
            appCheck = initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(siteKey),
                isTokenAutoRefreshEnabled: true  // Auto-refresh tokens before expiry
            });
            console.log('[Firebase] App Check initialized with reCAPTCHA v3');
        } catch (error) {
            console.error('[Firebase] App Check initialization failed:', error);
        }
    }
}

export { app, auth, appCheck };
export type { Auth };
