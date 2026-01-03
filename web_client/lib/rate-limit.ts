/**
 * Hybrid Rate Limiter - Firestore + In-Memory Cache
 * 
 * Architecture:
 * - Level 1: In-memory cache (fast, 10s TTL)
 * - Level 2: Firestore transaction (authoritative, distributed)
 * 
 * Benefits:
 * - Low latency for repeated requests (~0ms cache hit)
 * - Distributed protection against abuse
 * - Works across serverless instances
 */

import { db as getDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Get Firestore instance
const db = getDb();

// Configuration
const WINDOW_MS = 60000; // 1 minute sliding window
const MAX_REQUESTS = 20; // 20 requests per minute
const CACHE_TTL_MS = 10000; // 10 seconds cache

// Types
interface RateLimitData {
    count: number;
    windowStart: number;
    lastRequest: number;
}

interface CachedRateLimit {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    timestamp: number;
}

// In-memory cache for fast lookups
const cache = new Map<string, CachedRateLimit>();

// ✅ BUG FIX #1: Proper interval cleanup to prevent memory leak
let cleanupInterval: NodeJS.Timeout | null = null;

function initializeCleanup() {
    if (cleanupInterval) return; // Already initialized

    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, value] of cache.entries()) {
            if (now - value.timestamp > CACHE_TTL_MS) {
                cache.delete(key);
            }
        }
    }, 30000); // Clean every 30 seconds

    console.log('[RateLimit] Cache cleanup interval initialized');
}

// Initialize cleanup on module load
initializeCleanup();

// Cleanup on process termination (important for serverless)
process.on('beforeExit', () => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('[RateLimit] Cache cleanup interval cleared');
    }
});

/**
 * Check if IP is within rate limits
 * Uses Firestore as authoritative source (cache disabled for accuracy)
 */
export async function checkRateLimit(ip: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
}> {
    // Always check Firestore for accurate counting
    // NOTE: Cache was causing issues with window resets
    console.log('[RateLimit] Checking Firestore for IP:', ip);
    const result = await checkFirestoreRateLimit(ip);

    return result;
}

/**
 * Firestore-based rate limiting with sliding window
 */
async function checkFirestoreRateLimit(ip: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
}> {
    const rateLimitRef = db.collection('rate_limits').doc(ip);

    const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(rateLimitRef);
        const now = Date.now();

        if (!doc.exists) {
            // First request from this IP
            transaction.set(rateLimitRef, {
                count: 1,
                windowStart: Timestamp.fromMillis(now),
                lastRequest: Timestamp.fromMillis(now),
            });

            return {
                allowed: true,
                remaining: MAX_REQUESTS - 1,
                resetAt: now + WINDOW_MS,
            };
        }

        const data = doc.data() as any; // Firestore returns Timestamp objects
        const windowStart = data.windowStart.toMillis();
        const timeSinceWindowStart = now - windowStart;

        // Check if we need a new window
        if (timeSinceWindowStart >= WINDOW_MS) {
            // Start new window
            transaction.update(rateLimitRef, {
                count: 1,
                windowStart: Timestamp.fromMillis(now),
                lastRequest: Timestamp.fromMillis(now),
            });

            return {
                allowed: true,
                remaining: MAX_REQUESTS - 1,
                resetAt: now + WINDOW_MS,
            };
        }

        // Within existing window
        if (data.count >= MAX_REQUESTS) {
            // Rate limit exceeded
            return {
                allowed: false,
                remaining: 0,
                resetAt: windowStart + WINDOW_MS,
            };
        }

        // Increment counter
        transaction.update(rateLimitRef, {
            count: data.count + 1,
            lastRequest: Timestamp.fromMillis(now),
        });

        return {
            allowed: true,
            remaining: MAX_REQUESTS - (data.count + 1),
            resetAt: windowStart + WINDOW_MS,
        };
    });

    return {
        ...result,
        resetAt: new Date(result.resetAt),
    };
}

/**
 * Cleanup expired rate limit records (optional maintenance)
 * Call this from a cron job or scheduled function
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
    const twoHoursAgo = Timestamp.fromMillis(Date.now() - 7200000);

    const snapshot = await db.collection('rate_limits')
        .where('lastRequest', '<', twoHoursAgo)
        .limit(500)
        .get();

    if (snapshot.empty) {
        return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    console.log(`[RateLimit Cleanup] Deleted ${snapshot.size} expired records`);
    return snapshot.size;
}

/**
 * Get current rate limit stats for an IP (for debugging)
 */
export async function getRateLimitStats(ip: string): Promise<RateLimitData | null> {
    const doc = await db.collection('rate_limits').doc(ip).get();
    if (!doc.exists) return null;

    const data = doc.data() as any;
    return {
        count: data.count,
        windowStart: data.windowStart.toMillis(),
        lastRequest: data.lastRequest.toMillis(),
    };
}
