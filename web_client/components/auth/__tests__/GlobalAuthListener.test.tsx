/**
 * After the login the message the guest confirmed is sent again, in the
 * guest's conversation (Phase 138 PR-6). The bug: it was sent 1.5 s after the
 * login, on whatever session the chat had — `global-<uid>` while the guest's
 * chats were still being moved to the account.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { GlobalAuthListener } from '../GlobalAuthListener';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';
import { pendingMessageStore } from '@/lib/auth/pending-message';

let mockUser: { uid: string; isAnonymous: boolean } | null = null;
let mockSessionId = 'guest-chat';
const mockSendMessage = jest.fn();

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({ sessionId: mockSessionId, sendMessage: mockSendMessage }),
}));
jest.mock('../AuthDialog', () => ({ AuthDialog: () => null }));

const CONFIRMATION = 'Sì, prepara il preventivo';

function openLoginFromTheCard() {
    act(() => {
        window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', { detail: { pendingMessage: CONFIRMATION } }));
    });
}

/** The page after an auth or session change. */
function update(view: ReturnType<typeof render>, change: () => void) {
    act(change);
    view.rerender(<GlobalAuthListener />);
}

beforeEach(() => {
    jest.useFakeTimers();
    mockSendMessage.mockReset();
    mockUser = { uid: 'anon-1', isAnonymous: true };
    mockSessionId = 'guest-chat';
    guestClaimStore.reset();
    pendingMessageStore.clear();
});

afterEach(() => {
    jest.useRealTimers();
});

it('waits for the claim and sends the message in the guest chat, once', () => {
    const view = render(<GlobalAuthListener />);
    openLoginFromTheCard();

    // Signed in to an existing account: the chats are still moving (cold start).
    update(view, () => {
        guestClaimStore.set({ status: 'pending' });
        mockUser = { uid: 'user-1', isAnonymous: false };
        mockSessionId = 'chat-of-user-1';
    });
    act(() => { jest.advanceTimersByTime(5_000); });
    expect(mockSendMessage).not.toHaveBeenCalled();

    // Claimed; useChatSession opens the guest chat and resets the store.
    update(view, () => guestClaimStore.set({ status: 'done', openSessionId: 'guest-chat' }));
    expect(mockSendMessage).not.toHaveBeenCalled();
    update(view, () => {
        mockSessionId = 'guest-chat';
        guestClaimStore.reset();
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(CONFIRMATION);
    update(view, () => { mockSessionId = 'guest-chat'; });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
});

it('keeps the message while the claim failed, and sends it after a successful retry', () => {
    const view = render(<GlobalAuthListener />);
    openLoginFromTheCard();
    update(view, () => {
        mockUser = { uid: 'user-1', isAnonymous: false };
        mockSessionId = 'chat-of-user-1';
        guestClaimStore.set({ status: 'error', message: 'Errore', retry: jest.fn() });
    });
    act(() => { jest.advanceTimersByTime(5_000); });
    expect(mockSendMessage).not.toHaveBeenCalled();

    update(view, () => guestClaimStore.set({ status: 'pending' }));
    update(view, () => guestClaimStore.set({ status: 'done', openSessionId: 'guest-chat' }));
    update(view, () => {
        mockSessionId = 'guest-chat';
        guestClaimStore.reset();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(CONFIRMATION);
});

it('drops the message when the user closes a failed claim: it belongs to the guest chat', () => {
    const view = render(<GlobalAuthListener />);
    openLoginFromTheCard();
    update(view, () => {
        mockUser = { uid: 'user-1', isAnonymous: false };
        mockSessionId = 'chat-of-user-1';
        guestClaimStore.set({ status: 'error', message: 'Errore', retry: null });
    });
    update(view, () => guestClaimStore.reset());
    act(() => { jest.advanceTimersByTime(5_000); });

    expect(mockSendMessage).not.toHaveBeenCalled();
});

it('sends in the current chat when the account had no chat to open', () => {
    const view = render(<GlobalAuthListener />);
    openLoginFromTheCard();
    update(view, () => {
        mockUser = { uid: 'anon-1', isAnonymous: false }; // linked: same uid
        guestClaimStore.set({ status: 'done', openSessionId: null });
    });
    update(view, () => guestClaimStore.reset());

    expect(mockSendMessage).toHaveBeenCalledWith(CONFIRMATION);
});

it('sends nothing for a login finished in another tab (magic link): the guest chat is not known here', () => {
    const view = render(<GlobalAuthListener />);
    openLoginFromTheCard();
    update(view, () => {
        mockUser = { uid: 'user-1', isAnonymous: false };
        mockSessionId = 'chat-of-user-1';
    });
    act(() => { jest.advanceTimersByTime(5_000); });

    expect(mockSendMessage).not.toHaveBeenCalled();

    // Nor later, in an unrelated conversation: the stale confirmation was dropped.
    update(view, () => guestClaimStore.set({ status: 'done', openSessionId: 'chat-of-user-1' }));
    update(view, () => guestClaimStore.reset());
    expect(mockSendMessage).not.toHaveBeenCalled();
});

it('sends nothing while the user is still a guest', () => {
    const view = render(<GlobalAuthListener />);
    openLoginFromTheCard();
    update(view, () => {});
    act(() => { jest.advanceTimersByTime(5_000); });

    expect(mockSendMessage).not.toHaveBeenCalled();
});

it('sees a claim that ended before it mounted', () => {
    guestClaimStore.set({ status: 'done', openSessionId: 'guest-chat' });
    mockUser = { uid: 'user-1', isAnonymous: false };
    const view = render(<GlobalAuthListener />);
    act(() => {
        window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', { detail: { pendingMessage: CONFIRMATION } }));
    });
    update(view, () => guestClaimStore.reset());

    expect(mockSendMessage).toHaveBeenCalledWith(CONFIRMATION);
});
