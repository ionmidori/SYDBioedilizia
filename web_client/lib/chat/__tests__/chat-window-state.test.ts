/**
 * A login that leaves the page (redirect, magic link) comes back to a fresh
 * page: the chat window opens again only if it was open, once, and only for
 * that round trip (Phase 139 PR-0b).
 */
import {
    isChatWindowOpen,
    reopenChatOnNextPage,
    setChatWindowOpen,
    takeReopenChat,
} from '../chat-window-state';

const KEY = 'syd:reopenChat';

beforeEach(() => {
    sessionStorage.clear();
    setChatWindowOpen(false);
    jest.useRealTimers();
    jest.restoreAllMocks();
});

it('knows whether the chat window is open', () => {
    expect(isChatWindowOpen()).toBe(false);
    setChatWindowOpen(true);
    expect(isChatWindowOpen()).toBe(true);
});

it('reopens the chat on the next page, once', () => {
    reopenChatOnNextPage();

    expect(takeReopenChat()).toBe(true);
    expect(takeReopenChat()).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('does not reopen it when nothing was saved', () => {
    expect(takeReopenChat()).toBe(false);
});

it('does not reopen it when the user comes back too late', () => {
    jest.useFakeTimers({ now: new Date('2026-10-29T10:00:00Z') });
    reopenChatOnNextPage();
    jest.setSystemTime(new Date('2026-10-29T10:11:00Z'));

    expect(takeReopenChat()).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('ignores what it cannot read', () => {
    sessionStorage.setItem(KEY, '{not json');
    expect(takeReopenChat()).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('never throws when storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError');
    });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
    });

    expect(() => reopenChatOnNextPage()).not.toThrow();
    expect(takeReopenChat()).toBe(false);
});
