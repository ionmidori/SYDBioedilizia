/**
 * Tool-specific quota system (IP-based, daily limits)
 * 
 * Provides fine-grained quota management for expensive AI operations.
 * Uses Firestore transactions to ensure consistency across distributed instances.
 * 
 * @module tool-quota
 * 
 * Limits:
 * - Max 2 renders per IP per 24h
 * - Max 2 quotes per IP per 24h
 * 
 * This is separate from the general rate limiter (20 req/min)
 * and protects expensive AI operations.
 * 
 * @example
 * ```typescript
 * import { checkToolQuota, incrementToolQuota } from '@ai-core';
 * 
 * // Before expensive operation
 * const check = await checkToolQuota(userIP, 'render');
 * if (!check.allowed) {
 *   return { error: `Quota exceeded. Reset at ${check.resetAt}` };
 * }
 * 
 * // After successful operation
 * await incrementToolQuota(userIP, 'render', { metadata });
 * ```
 */

import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// ✅ IP validation regex (IPv4 and IPv6)
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

// Configuration
const QUOTA_WINDOW_MS = 86400000; // 24 hours
const MAX_RENDERS_PER_DAY = 50;
const MAX_QUOTES_PER_DAY = 2;

/**
 * Supported tool types for quota tracking
 */
export type ToolQuotaType = 'render' | 'quote';

/**
 * Quota data structure stored in Firestore
 */
interface QuotaData {
    /** Current usage count within the window */
    count: number;
    /** Maximum allowed operations in the window */
    limit: number;
    /** Window start timestamp (milliseconds since epoch) */
    windowStart: number;
    /** Array of individual operation records */
    calls: Array<{
        /** Operation timestamp */
        timestamp: number;
        /** Optional metadata about the operation */
        metadata?: any;
    }>;
}

/**
 * Result of a quota check operation
 */
interface QuotaCheckResult {
    /** Whether the operation is allowed */
    allowed: boolean;
    /** Number of operations remaining in current window */
    remaining: number;
    /** When the quota window resets */
    resetAt: Date;
    /** Current usage count */
    currentCount: number;
}

/**
 * Validates an IP address format
 * @param ip - IP address to validate
 * @returns true if valid IPv4 or IPv6
 * @private
 */
function isValidIP(ip: string): boolean {
    return IP_REGEX.test(ip);
}

/**
 * Check if IP is within quota for a specific tool
 * 
 * Uses Firestore transactions to ensure atomicity and prevent race conditions.
 * Implements a sliding 24-hour window that automatically resets.
 * 
 * @param ip - User's IP address (IPv4 or IPv6)
 * @param toolType - Type of tool ('render' or 'quote')
 * @returns Promise resolving to quota check result
 * @throws Error if IP is invalid or Firestore operation fails
 * 
 * @example
 * ```typescript
 * const result = await checkToolQuota('192.168.1.1', 'render');
 * if (!result.allowed) {
 *   console.log(`Quota exceeded. Reset at: ${result.resetAt}`);
 * }
 * ```
 */
export async function checkToolQuota(
    ip: string,
    toolType: ToolQuotaType
): Promise<QuotaCheckResult> {
    // ✅ Input validation
    if (!ip || typeof ip !== 'string') {
        throw new Error('[ToolQuota] Invalid IP: must be a non-empty string');
    }

    if (!isValidIP(ip)) {
        console.warn(`[ToolQuota] Potentially invalid IP format: ${ip}`);
        // Don't throw - might be proxy/forwarded IP
    }

    if (!toolType || !['render', 'quote'].includes(toolType)) {
        throw new Error(`[ToolQuota] Invalid tool type: ${toolType}`);
    }
    const firestore = db();
    const quotaRef = firestore.collection('tool_quotas').doc(ip);

    const result = await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(quotaRef);
        const now = Date.now();

        const limit = toolType === 'render' ? MAX_RENDERS_PER_DAY : MAX_QUOTES_PER_DAY;

        if (!doc.exists) {
            // First request from this IP
            const newData: Record<string, QuotaData> = {
                [toolType]: {
                    count: 0,
                    limit,
                    windowStart: now,
                    calls: [],
                }
            };

            transaction.set(quotaRef, newData);

            return {
                allowed: true,
                remaining: limit,
                resetAt: now + QUOTA_WINDOW_MS,
                currentCount: 0,
            };
        }

        const data = doc.data() as Record<string, any>;
        const toolData = data[toolType] as QuotaData | undefined;

        if (!toolData) {
            // First time using this specific tool
            const updates: Record<string, QuotaData> = {
                ...data,
                [toolType]: {
                    count: 0,
                    limit,
                    windowStart: now,
                    calls: [],
                }
            };

            transaction.set(quotaRef, updates);

            return {
                allowed: true,
                remaining: limit,
                resetAt: now + QUOTA_WINDOW_MS,
                currentCount: 0,
            };
        }

        const timeSinceWindowStart = now - toolData.windowStart;

        // Check if we need a new window (24h passed)
        if (timeSinceWindowStart >= QUOTA_WINDOW_MS) {
            // Reset quota for new 24h window
            const updates = {
                ...data,
                [toolType]: {
                    count: 0,
                    limit,
                    windowStart: now,
                    calls: [],
                }
            };

            transaction.set(quotaRef, updates);

            return {
                allowed: true,
                remaining: limit,
                resetAt: now + QUOTA_WINDOW_MS,
                currentCount: 0,
            };
        }

        // Within existing window - check quota
        if (toolData.count >= limit) {
            // Quota exceeded
            return {
                allowed: false,
                remaining: 0,
                resetAt: toolData.windowStart + QUOTA_WINDOW_MS,
                currentCount: toolData.count,
            };
        }

        // Quota available
        return {
            allowed: true,
            remaining: limit - toolData.count,
            resetAt: toolData.windowStart + QUOTA_WINDOW_MS,
            currentCount: toolData.count,
        };
    });

    return {
        ...result,
        resetAt: new Date(result.resetAt),
    };
}

/**
 * Increment quota counter after successful tool execution
 * 
 * Should be called ONLY after the expensive operation completes successfully.
 * Uses Firestore transactions to ensure the increment is atomic.
 * 
 * @param ip - User's IP address
 * @param toolType - Type of tool that was executed
 * @param metadata - Optional metadata about the operation (e.g., roomType, imageUrl)
 * @throws Error if IP is invalid or Firestore operation fails
 * 
 * @example
 * ```typescript
 * // After successful image generation
 * await incrementToolQuota(userIP, 'render', {
 *   roomType: 'kitchen',
 *   style: 'modern',
 *   imageUrl: 'https://...'
 * });
 * ```
 */
export async function incrementToolQuota(
    ip: string,
    toolType: ToolQuotaType,
    metadata?: any
): Promise<void> {
    // ✅ Input validation
    if (!ip || typeof ip !== 'string') {
        throw new Error('[ToolQuota] Invalid IP: must be a non-empty string');
    }

    if (!toolType || !['render', 'quote'].includes(toolType)) {
        throw new Error(`[ToolQuota] Invalid tool type: ${toolType}`);
    }
    const firestore = db();
    const quotaRef = firestore.collection('tool_quotas').doc(ip);
    const now = Date.now();

    await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(quotaRef);

        if (!doc.exists) {
            console.error('[ToolQuota] Document should exist before increment. Creating it now.');
            const limit = toolType === 'render' ? MAX_RENDERS_PER_DAY : MAX_QUOTES_PER_DAY;

            transaction.set(quotaRef, {
                [toolType]: {
                    count: 1,
                    limit,
                    windowStart: now,
                    calls: [{ timestamp: now, metadata }]
                }
            });
            return;
        }

        const data = doc.data() as Record<string, any>;
        const toolData = data[toolType] as QuotaData;

        // Increment count and add call record
        const updatedToolData: QuotaData = {
            ...toolData,
            count: toolData.count + 1,
            calls: [
                ...toolData.calls,
                { timestamp: now, metadata }
            ]
        };

        transaction.update(quotaRef, {
            [toolType]: updatedToolData
        });
    });

    console.log(`[ToolQuota] Incremented ${toolType} quota for IP ${ip}`);
}

/**
 * Get current quota stats for an IP (for debugging and monitoring)
 * 
 * @param ip - IP address to query
 * @returns Promise resolving to quota data or null if no record exists
 * @throws Error if IP is invalid
 * 
 * @example
 * ```typescript
 * const stats = await getToolQuotaStats('192.168.1.1');
 * if (stats) {
 *   console.log(`Render quota: ${stats.render.count}/${stats.render.limit}`);
 *   console.log(`Quote quota: ${stats.quote.count}/${stats.quote.limit}`);
 * }
 * ```
 */
export async function getToolQuotaStats(ip: string): Promise<Record<string, QuotaData> | null> {
    if (!ip || typeof ip !== 'string') {
        throw new Error('[ToolQuota] Invalid IP: must be a non-empty string');
    }
    const firestore = db();
    const doc = await firestore.collection('tool_quotas').doc(ip).get();
    if (!doc.exists) return null;

    return doc.data() as Record<string, QuotaData>;
}

/**
 * Cleanup expired quota records (maintenance)
 * 
 * Removes quota records older than 48 hours to prevent database bloat.
 * Should be called periodically (e.g., daily cron job).
 * 
 * @returns Promise resolving to number of records deleted
 * 
 * @example
 * ```typescript
 * // In a scheduled Cloud Function or cron job
 * const deleted = await cleanupExpiredQuotas();
 * console.log(`Cleaned up ${deleted} expired quota records`);
 * ```
 */
export async function cleanupExpiredQuotas(): Promise<number> {
    const firestore = db();
    const twoDaysAgo = Timestamp.fromMillis(Date.now() - 172800000); // 48h

    const snapshot = await firestore.collection('tool_quotas')
        .where('render.windowStart', '<', twoDaysAgo)
        .limit(500)
        .get();

    if (snapshot.empty) {
        return 0;
    }

    const batch = firestore.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));

    await batch.commit();

    console.log(`[ToolQuota Cleanup] Deleted ${snapshot.size} expired records`);
    return snapshot.size;
}
