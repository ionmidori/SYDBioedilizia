import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useChatSession } from '../useChatSession';

type MockUser = { uid: string; isAnonymous: boolean } | null;

let mockUser: MockUser = null;
let mockIsInitialized = true;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, isInitialized: mockIsInitialized }),
}));

jest.useFakeTimers();

const GUEST_KEY = 'chatSessionId';

/** Render and flush the deferred setState that publishes the guest id. */
function renderSession() {
    const rendered = renderHook(() => useChatSession());
    act(() => { jest.runAllTimers(); });
    return rendered;
}

beforeEach(() => {
    localStorage.clear();
    mockUser = null;
    mockIsInitialized = true;
    jest.clearAllMocks();
});

describe('useChatSession — guest identity', () => {
    it('mints and persists a guest id on first run', () => {
        const { result } = renderSession();

        const stored = localStorage.getItem(GUEST_KEY);
        expect(stored).toBeTruthy();
        expect(result.current.sessionId).toBe(stored);
    });

    it('reuses the stored guest id across mounts', () => {
        localStorage.setItem(GUEST_KEY, 'existing-guest');

        const { result } = renderSession();

        expect(result.current.sessionId).toBe('existing-guest');
    });

    it('keeps the guest id for anonymous Firebase users', () => {
        // Switching sessionId mid-message would reset useChat and wipe the messages.
        localStorage.setItem(GUEST_KEY, 'existing-guest');
        mockUser = { uid: 'anon-1', isAnonymous: true };

        const { result } = renderSession();

        expect(result.current.sessionId).toBe('existing-guest');
    });
});

describe('useChatSession — authenticated identity', () => {
    it('derives a global session from the uid', () => {
        mockUser = { uid: 'u-1', isAnonymous: false };

        const { result } = renderSession();

        expect(result.current.sessionId).toBe('global-u-1');
    });

    it('uses the project id when one is selected', () => {
        mockUser = { uid: 'u-1', isAnonymous: false };
        const { result } = renderSession();

        act(() => { result.current.setCurrentProjectId('proj-9'); });

        expect(result.current.sessionId).toBe('proj-9');
    });
});

describe('useChatSession — last active project', () => {
    it('persists the selected project per user', () => {
        mockUser = { uid: 'u-1', isAnonymous: false };
        const { result } = renderSession();

        act(() => { result.current.setCurrentProjectId('proj-9'); });

        expect(localStorage.getItem('last_active_project:u-1')).toBe('proj-9');
    });

    it('restores it on the next mount', () => {
        localStorage.setItem('last_active_project:u-1', 'proj-9');
        mockUser = { uid: 'u-1', isAnonymous: false };

        const { result } = renderSession();

        expect(result.current.currentProjectId).toBe('proj-9');
        expect(result.current.sessionId).toBe('proj-9');
    });

    it('does not restore before auth is initialised', () => {
        localStorage.setItem('last_active_project:u-1', 'proj-9');
        mockUser = { uid: 'u-1', isAnonymous: false };
        mockIsInitialized = false;

        const { result } = renderSession();

        expect(result.current.currentProjectId).toBeNull();
    });

    it('never persists a project for anonymous users', () => {
        mockUser = { uid: 'anon-1', isAnonymous: true };
        const { result } = renderSession();

        act(() => { result.current.setCurrentProjectId('proj-9'); });

        expect(localStorage.getItem('last_active_project:anon-1')).toBeNull();
    });
});

describe('useChatSession — logout reset', () => {
    it('mints a fresh guest session and drops the project', () => {
        localStorage.setItem(GUEST_KEY, 'old-guest');
        mockUser = { uid: 'u-1', isAnonymous: false };
        const { result, rerender } = renderSession();

        act(() => { result.current.setCurrentProjectId('proj-9'); });
        expect(result.current.sessionId).toBe('proj-9');

        // Logout: the provider clears the SDK messages and calls this.
        mockUser = null;
        act(() => { result.current.resetToNewGuestSession(); });
        rerender();

        expect(result.current.currentProjectId).toBeNull();
        expect(result.current.sessionId).not.toBe('proj-9');
        expect(result.current.sessionId).not.toBe('old-guest');
    });

    it('persists the new guest id so a reload keeps the same session', () => {
        // AuthProvider.logout() removes chatSessionId for privacy. If the fresh id
        // only lives in memory, the post-logout conversation is written under an id
        // no reload can reproduce: F5 mints a different one, queries an empty
        // session and falls back to the welcome message.
        mockUser = { uid: 'u-1', isAnonymous: false };
        const { result } = renderSession();

        localStorage.removeItem(GUEST_KEY); // what logout does
        mockUser = null;
        act(() => { result.current.resetToNewGuestSession(); });

        const liveId = result.current.sessionId;
        expect(localStorage.getItem(GUEST_KEY)).toBe(liveId);

        // A reload must land on the same session, not mint a third id.
        const reloaded = renderSession();
        expect(reloaded.result.current.sessionId).toBe(liveId);
    });
});
