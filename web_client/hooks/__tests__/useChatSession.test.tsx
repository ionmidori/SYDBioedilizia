import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useChatSession } from '../useChatSession';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';
import { userChatApi } from '@/lib/user-chat-api';

type MockUser = { uid: string; isAnonymous: boolean } | null;

let mockUser: MockUser = null;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, isInitialized: true }),
}));
jest.mock('@/lib/user-chat-api', () => ({
    userChatApi: { getMyChat: jest.fn() },
}));

const getMyChat = userChatApi.getMyChat as jest.Mock;
const GUEST_KEY = 'chatSessionId';

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Render and flush the deferred setState that publishes the guest id. */
function renderSession() {
    const rendered = renderHook(() => useChatSession(), { wrapper });
    act(() => { jest.runOnlyPendingTimers(); });
    return rendered;
}

beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    mockUser = null;
    getMyChat.mockReset();
    guestClaimStore.reset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
    jest.useRealTimers();
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

    it('keeps the guest id for anonymous Firebase users, without asking for a user chat', () => {
        // Switching sessionId mid-message would reset useChat and wipe the messages.
        localStorage.setItem(GUEST_KEY, 'existing-guest');
        mockUser = { uid: 'anon-1', isAnonymous: true };

        const { result } = renderSession();

        expect(result.current.sessionId).toBe('existing-guest');
        expect(result.current.userChatId).toBeNull();
        expect(getMyChat).not.toHaveBeenCalled();
    });
});

describe('useChatSession — the signed-in user’s chat (Phase 139)', () => {
    it('uses the chat the backend gives, never an id of its own', async () => {
        mockUser = { uid: 'u-1', isAnonymous: false };
        getMyChat.mockResolvedValue({ chat_id: 'chat-of-u1', created: false });

        const { result } = renderSession();

        expect(result.current.sessionId).toBeNull(); // nothing to send to until it is known
        await waitFor(() => expect(result.current.sessionId).toBe('chat-of-u1'));
        expect(result.current.userChatId).toBe('chat-of-u1');
        expect(getMyChat).toHaveBeenCalledTimes(1);
    });

    it('keeps no chat of its own in localStorage', async () => {
        localStorage.setItem('last_active_project:u-1', 'old-project');
        mockUser = { uid: 'u-1', isAnonymous: false };
        getMyChat.mockResolvedValue({ chat_id: 'chat-of-u1', created: false });

        const { result } = renderSession();

        await waitFor(() => expect(result.current.sessionId).toBe('chat-of-u1'));
        expect(localStorage.getItem('last_active_project:u-1')).toBe('old-project'); // ignored, not rewritten
    });

    it('reports a chat it could not get', async () => {
        mockUser = { uid: 'u-1', isAnonymous: false };
        getMyChat.mockRejectedValue(new Error('offline'));

        const { result } = renderSession();

        await waitFor(() => expect(result.current.userChatError).not.toBeNull());
        expect(result.current.sessionId).toBeNull();
    });

    it('asks again on refresh and moves to the chat it gets now', async () => {
        mockUser = { uid: 'u-1', isAnonymous: false };
        getMyChat.mockResolvedValueOnce({ chat_id: 'old-chat', created: false });
        const { result } = renderSession();
        await waitFor(() => expect(result.current.sessionId).toBe('old-chat'));

        getMyChat.mockResolvedValueOnce({ chat_id: 'merged-into', created: false });
        let refreshed: string | null = null;
        await act(async () => { refreshed = await result.current.refreshUserChat(); });

        expect(refreshed).toBe('merged-into');
        // The query observers hear of the new answer on the next tick.
        await waitFor(() => expect(result.current.sessionId).toBe('merged-into'));
    });
});

describe('useChatSession — after a guest logs in', () => {
    it('waits for the guest chats to move before asking for the user chat', async () => {
        // Asking while the claim runs would make the backend create an empty chat
        // next to the guest's and then merge the guest's into it.
        mockUser = { uid: 'anon-1', isAnonymous: true };
        const { result, rerender } = renderSession();

        mockUser = { uid: 'u-1', isAnonymous: false };
        act(() => { guestClaimStore.set({ status: 'pending' }); });
        rerender();
        act(() => { jest.runOnlyPendingTimers(); });
        expect(getMyChat).not.toHaveBeenCalled();
        expect(result.current.sessionId).toBeNull();

        getMyChat.mockResolvedValue({ chat_id: 'account-chat', created: false });
        act(() => { guestClaimStore.set({ status: 'done', openSessionId: 'account-chat' }); });
        act(() => { jest.runOnlyPendingTimers(); });

        await waitFor(() => expect(result.current.sessionId).toBe('account-chat'));
        expect(guestClaimStore.get()).toEqual({ status: 'idle' });
    });
});

describe('useChatSession — logout reset', () => {
    it('mints a fresh guest session', async () => {
        localStorage.setItem(GUEST_KEY, 'old-guest');
        mockUser = { uid: 'u-1', isAnonymous: false };
        getMyChat.mockResolvedValue({ chat_id: 'chat-of-u1', created: false });
        const { result, rerender } = renderSession();
        await waitFor(() => expect(result.current.sessionId).toBe('chat-of-u1'));

        // Logout: the provider clears the SDK messages and calls this.
        mockUser = null;
        act(() => { result.current.resetToNewGuestSession(); });
        rerender();

        expect(result.current.userChatId).toBeNull();
        expect(result.current.sessionId).not.toBe('chat-of-u1');
        expect(result.current.sessionId).not.toBe('old-guest');
    });

    it('persists the new guest id so a reload keeps the same session', () => {
        // AuthProvider.logout() removes chatSessionId for privacy. If the fresh id
        // only lives in memory, the post-logout conversation is written under an id
        // no reload can reproduce: F5 mints a different one, queries an empty
        // session and falls back to the welcome message.
        const { result } = renderSession();

        localStorage.removeItem(GUEST_KEY); // what logout does
        act(() => { result.current.resetToNewGuestSession(); });

        const liveId = result.current.sessionId;
        expect(localStorage.getItem(GUEST_KEY)).toBe(liveId);

        // A reload must land on the same session, not mint a third id.
        const reloaded = renderSession();
        expect(reloaded.result.current.sessionId).toBe(liveId);
    });
});
