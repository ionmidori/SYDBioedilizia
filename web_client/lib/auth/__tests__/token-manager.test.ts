/**
 * Token Manager Unit Tests
 */

import { tokenManager } from '../token-manager';
import { User } from 'firebase/auth';

// Mock Firebase User
const createMockUser = (expirationMinutes: number = 60): Partial<User> => ({
    uid: 'test-user-123',
    getIdToken: jest.fn().mockResolvedValue('mock-token'),
    getIdTokenResult: jest.fn().mockResolvedValue({
        token: 'mock-token',
        expirationTime: new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString(),
        claims: {},
        authTime: new Date().toISOString(),
        issuedAtTime: new Date().toISOString(),
        signInProvider: 'google.com',
    }),
});

const flushPromises = () => new Promise(resolve => jest.requireActual('timers').setImmediate(resolve));

describe('TokenManager', () => {
    beforeEach(() => {
        jest.clearAllTimers();
        jest.useFakeTimers();
        tokenManager.stopMonitoring();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        tokenManager.stopMonitoring();
    });

    describe('startMonitoring', () => {
        it('should schedule token refresh before expiration', async () => {
            const mockUser = createMockUser(60) as User;

            await tokenManager.startMonitoring(mockUser);

            // Token should be scheduled to refresh at 55 minutes (5 min before expiry)
            expect(mockUser.getIdTokenResult).toHaveBeenCalled();
        });

        it('should not schedule refresh if user is null', async () => {
            const spy = jest.spyOn(console, 'log');

            await tokenManager.startMonitoring(null);

            expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('Token expires'));
        });

        it('should clear previous timer when called again', async () => {
            const mockUser1 = createMockUser(60) as User;
            const mockUser2 = createMockUser(30) as User;

            await tokenManager.startMonitoring(mockUser1);
            await tokenManager.startMonitoring(mockUser2);

            // Should have called getIdTokenResult for both users
            expect(mockUser1.getIdTokenResult).toHaveBeenCalled();
            expect(mockUser2.getIdTokenResult).toHaveBeenCalled();
        });
    });

    describe('token refresh', () => {
        it('should refresh token at scheduled time', async () => {
            const mockUser = createMockUser(60) as User;
            const refreshCallback = jest.fn();

            tokenManager.onRefresh(refreshCallback);
            await tokenManager.startMonitoring(mockUser);
            await flushPromises(); // Ensure .then() runs

            // Fast-forward to refresh time (55 minutes)
            jest.advanceTimersByTime(55 * 60 * 1000);

            // Wait for async operations
            await flushPromises();

            expect(mockUser.getIdToken).toHaveBeenCalledWith(true); // Force refresh
            expect(refreshCallback).toHaveBeenCalledWith('mock-token');
        });

        it('should emit error event on refresh failure', async () => {
            const mockUser = createMockUser(60) as User;
            const errorCallback = jest.fn();
            const refreshError = new Error('Token refresh failed');

            (mockUser.getIdToken as jest.Mock).mockRejectedValueOnce(refreshError);

            tokenManager.onError(errorCallback);
            await tokenManager.startMonitoring(mockUser);
            await flushPromises();

            // Fast-forward to refresh time
            jest.advanceTimersByTime(55 * 60 * 1000);

            // Wait for async operations
            await flushPromises();

            expect(errorCallback).toHaveBeenCalledWith(refreshError);
        });

        it('should restart monitoring after successful refresh', async () => {
            const mockUser = createMockUser(60) as User;

            await tokenManager.startMonitoring(mockUser);
            await flushPromises();

            // Fast-forward to first refresh
            jest.advanceTimersByTime(55 * 60 * 1000);
            await flushPromises();

            // getIdTokenResult should be called again to schedule next refresh
            expect(mockUser.getIdTokenResult).toHaveBeenCalledTimes(2);
        });
    });

    describe('stopMonitoring', () => {
        it('should clear scheduled refresh timer', async () => {
            const mockUser = createMockUser(60) as User;
            const refreshCallback = jest.fn();

            tokenManager.onRefresh(refreshCallback);
            await tokenManager.startMonitoring(mockUser);
            await flushPromises(); // Ensure timer is scheduled before we stop it

            tokenManager.stopMonitoring();

            // Fast-forward past refresh time
            jest.advanceTimersByTime(60 * 60 * 1000);
            await flushPromises();

            // Refresh should not have been called
            expect(refreshCallback).not.toHaveBeenCalled();
        });
    });

    describe('event subscriptions', () => {
        it('should allow multiple refresh callbacks', async () => {
            const mockUser = createMockUser(60) as User;
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            tokenManager.onRefresh(callback1);
            tokenManager.onRefresh(callback2);

            await tokenManager.startMonitoring(mockUser);
            await flushPromises();
            jest.advanceTimersByTime(55 * 60 * 1000);
            await flushPromises();

            expect(callback1).toHaveBeenCalledWith('mock-token');
            expect(callback2).toHaveBeenCalledWith('mock-token');
        });

        it('should allow unsubscribing from events', async () => {
            const mockUser = createMockUser(60) as User;
            const callback = jest.fn();

            const unsubscribe = tokenManager.onRefresh(callback);
            unsubscribe(); // Unsubscribe immediately

            await tokenManager.startMonitoring(mockUser);
            await flushPromises();
            jest.advanceTimersByTime(55 * 60 * 1000);
            await flushPromises();

            expect(callback).not.toHaveBeenCalled();
        });

        it('should handle errors in callbacks gracefully', async () => {
            const mockUser = createMockUser(60) as User;
            const errorCallback = jest.fn(() => {
                throw new Error('Callback error');
            });
            const validCallback = jest.fn();

            tokenManager.onRefresh(errorCallback);
            tokenManager.onRefresh(validCallback);

            await tokenManager.startMonitoring(mockUser);
            await flushPromises();
            jest.advanceTimersByTime(55 * 60 * 1000);
            await flushPromises();

            // Valid callback should still be called despite error in first callback
            expect(validCallback).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle token expiring very soon', async () => {
            const mockUser = createMockUser(3) as User; // Expires in 3 minutes
            const refreshCallback = jest.fn();

            tokenManager.onRefresh(refreshCallback);
            await tokenManager.startMonitoring(mockUser);
            await flushPromises();

            // Should refresh immediately (0 minutes wait since 3 - 5 < 0)
            jest.runOnlyPendingTimers();
            await flushPromises();


            expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
        });

        it('should handle getIdTokenResult failure', async () => {
            const mockUser = createMockUser(60) as User;
            const errorCallback = jest.fn();

            (mockUser.getIdTokenResult as jest.Mock).mockRejectedValueOnce(
                new Error('Failed to get token result')
            );

            tokenManager.onError(errorCallback);
            await tokenManager.startMonitoring(mockUser);
            await flushPromises();
            await flushPromises();

            expect(errorCallback).toHaveBeenCalled();
        });
    });
});
