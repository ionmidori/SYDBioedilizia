import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

/**
 * Firebase Admin SDK initialization for server-side operations
 * Singleton pattern ensures single instance across serverless invocations
 * ALWAYS loads from firebase-service-account.json for reliability
 */

let firebaseApp: App | undefined;
let firestoreInstance: Firestore | undefined;
let storageInstance: Storage | undefined;

/**
 * ✅ CRITICAL FIX #2: Validate Firebase credentials format
 * Prevents security risks from malformed credentials
 */
/**
 * ✅ CRITICAL FIX #2: Sanitize and Validate Firebase Private Key
 * Prevents security risks from malformed credentials and ensures correct format.
 * Returns the sanitized private key.
 */
function sanitizeAndValidatePrivateKey(privateKey: string): string {
    if (!privateKey) {
        throw new Error('[Firebase] Private key is missing');
    }

    // 1. Sanitize: Handle both escaped (\n) and unescaped newlines
    let sanitizedKey = privateKey.replace(/\\n/g, '\n');

    // 2. Sanitize: Remove wrapping quotes if present (common env var issue)
    if (sanitizedKey.startsWith('"') && sanitizedKey.endsWith('"')) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }
    if (sanitizedKey.startsWith("'") && sanitizedKey.endsWith("'")) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }

    // 3. Validation: Check for standard PEM format markers
    if (!sanitizedKey.includes('BEGIN PRIVATE KEY') || !sanitizedKey.includes('END PRIVATE KEY')) {
        throw new Error('[Firebase] Invalid private key format - must be a valid RSA private key (PEM format)');
    }

    // 4. Validation: content check
    const keyContent = sanitizedKey.split('BEGIN PRIVATE KEY')[1]?.split('END PRIVATE KEY')[0];
    if (!keyContent || keyContent.trim().length < 100) {
        throw new Error('[Firebase] Private key appears to be truncated or empty');
    }

    // 5. Re-verify newlines for PEM validity
    if (!sanitizedKey.includes('\n')) {
        throw new Error('[Firebase] Private key invalid: missing newlines after sanitization');
    }

    return sanitizedKey;
}

/**
 * Validates other credential fields
 */
function validateServiceAccount(clientEmail: string, projectId: string): void {
    // Validate email format
    if (!clientEmail || !clientEmail.includes('@') || !clientEmail.endsWith('.gserviceaccount.com')) {
        throw new Error(`[Firebase] Invalid service account email: ${clientEmail} - must end with .gserviceaccount.com`);
    }

    // Validate project ID format
    if (!projectId || projectId.length < 6 || !/^[a-z0-9-]+$/.test(projectId)) {
        throw new Error(`[Firebase] Invalid project ID: ${projectId} - must contain only lowercase letters, numbers, and hyphens`);
    }
}

/**
 * Initialize Firebase Admin SDK
 * Loads from environment variables (Vercel-compatible) or falls back to JSON file
 */
function initializeFirebase(): App {
    if (getApps().length === 0) {
        console.log('[Firebase] Initializing Firebase Admin SDK...');

        try {
            // Try environment variables first (Vercel-compatible)
            // Try environment variables first (Vercel-compatible)
            const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

            if (rawPrivateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
                console.log('[Firebase] Loading credentials from environment variables');

                // ✅ CRITICAL FIX #2: Sanitize & Validate
                const privateKey = sanitizeAndValidatePrivateKey(rawPrivateKey);

                validateServiceAccount(
                    process.env.FIREBASE_CLIENT_EMAIL,
                    process.env.FIREBASE_PROJECT_ID
                );

                firebaseApp = initializeApp({
                    credential: cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: privateKey,
                    }),
                    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
                });

                console.log('[Firebase] ✅ Successfully initialized from environment variables');

                return firebaseApp;
            }

            // Fallback to JSON file (local development)
            const fs = require('fs');
            const path = require('path');

            const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');

            console.log('[Firebase] Loading credentials from:', serviceAccountPath);

            if (!fs.existsSync(serviceAccountPath)) {
                throw new Error(`Firebase service account file not found at: ${serviceAccountPath}. Please ensure firebase-service-account.json exists in the project root OR set environment variables.`);
            }

            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

            // ✅ CRITICAL FIX #2: Validate JSON file credentials
            const privateKey = sanitizeAndValidatePrivateKey(serviceAccount.private_key);

            validateServiceAccount(
                serviceAccount.client_email,
                serviceAccount.project_id
            );

            firebaseApp = initializeApp({
                credential: cert({
                    ...serviceAccount,
                    private_key: privateKey // Use sanitized key
                }),
                storageBucket: serviceAccount.project_id + '.firebasestorage.app',
            });

            console.log('[Firebase] ✅ Successfully initialized from JSON file');

            return firebaseApp!; // Assert not null since we just initialized it
        } catch (error) {
            console.error('[Firebase] ❌ Initialization FAILED:', error);
            throw error;
        }
    }

    return getApps()[0];
}

/**
 * Get Firestore instance (singleton)
 * CRITICAL FIX: Removed settings() call to prevent re-initialization error
 */
export function getFirestoreDb(): Firestore {
    if (!firestoreInstance) {
        const app = initializeFirebase();
        firestoreInstance = getFirestore(app);
        // REMOVED: settings() call - was causing "already initialized" error
    }

    return firestoreInstance;
}

/**
 * Get Firebase Storage instance (singleton)
 */
export function getFirebaseStorage(): Storage {
    if (!storageInstance) {
        const app = initializeFirebase();
        storageInstance = getStorage(app);
    }

    return storageInstance;
}

// Export convenient aliases
export const db = getFirestoreDb;
export const storage = getFirebaseStorage;
