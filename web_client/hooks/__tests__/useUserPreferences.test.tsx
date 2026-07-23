import { usersApi } from '@/lib/users-api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useUserPreferences } from '../useUserPreferences';

type MockUser = { uid: string } | null;
let mockUser: MockUser = null;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/lib/users-api', () => ({
    usersApi: { updatePreferences: jest.fn() },
}));

// firebase/firestore is globally mocked in jest.setup.js; capture the
// onSnapshot callbacks so tests can drive the subscription by hand.
const mockOnSnapshot = onSnapshot as jest.Mock;
const mockUpdatePreferences = usersApi.updatePreferences as jest.Mock;

type SnapshotCb = (snap: { exists: () => boolean; data: () => unknown }) => void;
type ErrorCb = (err: Error) => void;
let snapshotCb: SnapshotCb;
let errorCb: ErrorCb;
const unsubscribe = jest.fn();

beforeEach(() => {
    mockUser = null;
    mockUpdatePreferences.mockReset();
    unsubscribe.mockClear();
    mockOnSnapshot.mockReset().mockImplementation((_ref, onNext, onError) => {
        snapshotCb = onNext;
        errorCb = onError;
        return unsubscribe;
    });
});

const storedPrefs = {
    notifications: { email: false, quoteReady: true },
    ui: { sidebarCollapsed: true },
};

describe('useUserPreferences', () => {
    it('stops loading without subscribing when signed out', async () => {
        const { result } = renderHook(() => useUserPreferences());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(mockOnSnapshot).not.toHaveBeenCalled();
        // defaults remain
        expect(result.current.preferences.notifications.email).toBe(true);
    });

    it('hydrates from the Firestore snapshot', async () => {
        mockUser = { uid: 'u1' };
        const { result } = renderHook(() => useUserPreferences());

        act(() => snapshotCb({ exists: () => true, data: () => storedPrefs }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.preferences).toEqual(storedPrefs);
    });

    it('keeps the defaults when no preferences document exists', async () => {
        mockUser = { uid: 'u1' };
        const { result } = renderHook(() => useUserPreferences());

        act(() => snapshotCb({ exists: () => false, data: () => null }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.preferences.notifications.email).toBe(true);
    });

    it('surfaces a subscription error in Italian', async () => {
        mockUser = { uid: 'u1' };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = renderHook(() => useUserPreferences());

        act(() => errorCb(new Error('permission-denied')));

        await waitFor(() =>
            expect(result.current.error).toBe('Errore nel caricamento delle preferenze')
        );
        errorSpy.mockRestore();
    });

    it('unsubscribes on unmount', () => {
        mockUser = { uid: 'u1' };
        const { unmount } = renderHook(() => useUserPreferences());

        unmount();

        expect(unsubscribe).toHaveBeenCalled();
    });

    it('refuses to update while signed out', async () => {
        const { result } = renderHook(() => useUserPreferences());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(() => result.current.updatePreferences({ ui: { sidebarCollapsed: true } }));

        expect(result.current.error).toBe('Utente non autenticato');
        expect(mockUpdatePreferences).not.toHaveBeenCalled();
    });

    it('applies an optimistic update and persists via the backend', async () => {
        mockUser = { uid: 'u1' };
        mockUpdatePreferences.mockResolvedValue(undefined);
        const { result } = renderHook(() => useUserPreferences());
        act(() => snapshotCb({ exists: () => true, data: () => storedPrefs }));

        await act(() =>
            result.current.updatePreferences({ notifications: { email: true, quoteReady: false } })
        );

        expect(result.current.preferences.notifications).toEqual({
            email: true,
            quoteReady: false,
        });
        expect(mockUpdatePreferences).toHaveBeenCalledWith({
            notifications: { email: true, quoteReady: false },
        });
        expect(result.current.error).toBeNull();
    });

    it('reports a save failure in Italian', async () => {
        mockUser = { uid: 'u1' };
        mockUpdatePreferences.mockRejectedValue(new Error('offline'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = renderHook(() => useUserPreferences());
        act(() => snapshotCb({ exists: () => true, data: () => storedPrefs }));

        await act(() => result.current.updatePreferences({ ui: { sidebarCollapsed: false } }));

        expect(result.current.error).toBe('Errore nel salvataggio delle preferenze');
        errorSpy.mockRestore();
    });
});
