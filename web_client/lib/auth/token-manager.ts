/**
 * Token Lifecycle Manager
 * 
 * Handles automatic token refresh before expiration to prevent
 * 401 errors during active sessions.
 * 
 * Firebase JWT tokens expire after 1 hour by default.
 * This manager refreshes tokens 5 minutes before expiry.
 */

import { User } from 'firebase/auth';
import { logger } from '@/lib/logger';

interface TokenRefreshConfig {
    /** Minutes before token expiry to trigger refresh (default: 5) */
    refreshMarginMinutes?: number;
}

type TokenRefreshCallback = (newToken: string) => void;
type TokenErrorCallback = (error: Error) => void;

class TokenManager {
    private refreshTimer: NodeJS.Timeout | null = null;
    private onRefreshCallbacks: TokenRefreshCallback[] = [];
    private onErrorCallbacks: TokenErrorCallback[] = [];
    private config: Required<TokenRefreshConfig>;

    constructor(config: TokenRefreshConfig = {}) {
        this.config = {
            refreshMarginMinutes: config.refreshMarginMinutes ?? 5,
        };
    }

    /**
     * Start monitoring token expiration for a user
     */
    startMonitoring(user: User | null) {
        this.stopMonitoring(); // Clear any existing timer

        if (!user) return;

        // Get current token and decode expiration
        user.getIdTokenResult()
            .then((tokenResult) => {
                const expirationTime = new Date(tokenResult.expirationTime).getTime();
                const now = Date.now();
                const timeUntilExpiry = expirationTime - now;

                // Calculate when to refresh (5 minutes before expiry)
                const refreshMarginMs = this.config.refreshMarginMinutes * 60 * 1000;
                const timeUntilRefresh = Math.max(0, timeUntilExpiry - refreshMarginMs);

                logger.debug(
                    `[TokenManager] Token expires at ${new Date(expirationTime).toLocaleTimeString()}.`,
                    `Scheduling refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes.`
                );

                // Schedule refresh
                this.refreshTimer = setTimeout(() => {
                    this.refreshToken(user);
                }, timeUntilRefresh);
            })
            .catch((error) => {
                console.error('[TokenManager] Failed to get token expiration:', error);
                this.notifyError(error);
            });
    }

    /**
     * Force refresh the token immediately
     */
    private async refreshToken(user: User) {
        try {
            logger.debug('[TokenManager] Refreshing token...');
            const newToken = await user.getIdToken(true); // Force refresh
            logger.debug('[TokenManager] ✅ Token refreshed successfully');

            this.notifyRefresh(newToken);

            // Restart monitoring with new token
            this.startMonitoring(user);
        } catch (error) {
            console.error('[TokenManager] ❌ Token refresh failed:', error);
            this.notifyError(error as Error);
        }
    }

    /**
     * Stop monitoring token expiration
     */
    stopMonitoring() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Subscribe to token refresh events
     */
    onRefresh(callback: TokenRefreshCallback) {
        this.onRefreshCallbacks.push(callback);
        return () => {
            this.onRefreshCallbacks = this.onRefreshCallbacks.filter(cb => cb !== callback);
        };
    }

    /**
     * Subscribe to token error events
     */
    onError(callback: TokenErrorCallback) {
        this.onErrorCallbacks.push(callback);
        return () => {
            this.onErrorCallbacks = this.onErrorCallbacks.filter(cb => cb !== callback);
        };
    }

    private notifyRefresh(token: string) {
        this.onRefreshCallbacks.forEach(callback => {
            try {
                callback(token);
            } catch (error) {
                console.error('[TokenManager] Error in refresh callback:', error);
            }
        });
    }

    private notifyError(error: Error) {
        this.onErrorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (err) {
                console.error('[TokenManager] Error in error callback:', err);
            }
        });
    }
}

// Singleton instance
export const tokenManager = new TokenManager({
    refreshMarginMinutes: parseInt(process.env.NEXT_PUBLIC_TOKEN_REFRESH_MARGIN_MINUTES || '5', 10),
});
