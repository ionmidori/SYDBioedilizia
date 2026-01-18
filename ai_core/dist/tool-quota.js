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
 * - Max 2 market price searches per IP per 24h
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
const MAX_RENDERS_PER_DAY = 5;
const MAX_QUOTES_PER_DAY = 10;
const MAX_MARKET_PRICES_PER_DAY = 5;
/**
 * Validates an IP address format
 * @param ip - IP address to validate
 * @returns true if valid IPv4 or IPv6
 * @private
 */
function isValidIP(ip) {
    return IP_REGEX.test(ip);
}
/**
 * Check if IP is within quota for a specific tool
 *
 * Uses Firestore transactions to ensure atomicity and prevent race conditions.
 * Implements a sliding window that automatically resets.
 *
 * @param ip - User's IP address (IPv4 or IPv6)
 * @param toolType - Type of tool ('render' or 'quote')
 * @param customLimit - Optional custom limit to override default (e.g., for guest users)
 * @param customWindow - Optional custom window duration in ms (e.g., 48h for guests)
 * @returns Promise resolving to quota check result
 * @throws Error if IP is invalid or Firestore operation fails
 */
export async function checkToolQuota(ip, toolType, customLimit, customWindow) {
    // ✅ Input validation
    if (!ip || typeof ip !== 'string') {
        throw new Error('[ToolQuota] Invalid IP: must be a non-empty string');
    }
    if (!isValidIP(ip)) {
        console.warn(`[ToolQuota] Potentially invalid IP format: ${ip}`);
        // Don't throw - might be proxy/forwarded IP
    }
    if (!toolType || !['render', 'quote', 'market_prices'].includes(toolType)) {
        throw new Error(`[ToolQuota] Invalid tool type: ${toolType}`);
    }
    const firestore = db();
    const quotaRef = firestore.collection('tool_quotas').doc(ip);
    const result = await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(quotaRef);
        const now = Date.now();
        // Use custom window if provided, otherwise default to 24h
        const windowMs = customWindow !== undefined ? customWindow : QUOTA_WINDOW_MS;
        // Use custom limit if provided, otherwise use default
        const limit = customLimit !== undefined ? customLimit : (toolType === 'render'
            ? MAX_RENDERS_PER_DAY
            : toolType === 'market_prices'
                ? MAX_MARKET_PRICES_PER_DAY
                : MAX_QUOTES_PER_DAY);
        if (!doc.exists) {
            // First request from this IP
            const newData = {
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
                resetAt: now + windowMs,
                currentCount: 0,
            };
        }
        const data = doc.data();
        const toolData = data[toolType];
        if (!toolData) {
            // First time using this specific tool
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
                resetAt: now + windowMs,
                currentCount: 0,
            };
        }
        const timeSinceWindowStart = now - toolData.windowStart;
        // Check if we need a new window
        if (timeSinceWindowStart >= windowMs) {
            // Reset quota for new window
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
                resetAt: now + windowMs,
                currentCount: 0,
            };
        }
        // Within existing window - check quota
        if (toolData.count >= limit) {
            // Quota exceeded
            return {
                allowed: false,
                remaining: 0,
                resetAt: toolData.windowStart + windowMs,
                currentCount: toolData.count,
            };
        }
        // Quota available
        return {
            allowed: true,
            remaining: limit - toolData.count,
            resetAt: toolData.windowStart + windowMs,
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
export async function incrementToolQuota(ip, toolType, metadata) {
    // ✅ Input validation
    if (!ip || typeof ip !== 'string') {
        throw new Error('[ToolQuota] Invalid IP: must be a non-empty string');
    }
    if (!toolType || !['render', 'quote', 'market_prices'].includes(toolType)) {
        throw new Error(`[ToolQuota] Invalid tool type: ${toolType}`);
    }
    const firestore = db();
    const quotaRef = firestore.collection('tool_quotas').doc(ip);
    const now = Date.now();
    await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(quotaRef);
        if (!doc.exists) {
            console.error('[ToolQuota] Document should exist before increment. Creating it now.');
            const limit = toolType === 'render'
                ? MAX_RENDERS_PER_DAY
                : toolType === 'market_prices'
                    ? MAX_MARKET_PRICES_PER_DAY
                    : MAX_QUOTES_PER_DAY;
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
        const data = doc.data();
        const toolData = data[toolType];
        // Increment count and add call record
        const updatedToolData = {
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
export async function getToolQuotaStats(ip) {
    if (!ip || typeof ip !== 'string') {
        throw new Error('[ToolQuota] Invalid IP: must be a non-empty string');
    }
    const firestore = db();
    const doc = await firestore.collection('tool_quotas').doc(ip).get();
    if (!doc.exists)
        return null;
    return doc.data();
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
export async function cleanupExpiredQuotas() {
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
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[ToolQuota Cleanup] Deleted ${snapshot.size} expired records`);
    return snapshot.size;
}
