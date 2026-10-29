/**
 * The message a guest confirmed survives a social login by redirect (the page
 * reloads), in this tab only and only for that round trip (Phase 138 PR-6).
 */
import { pendingMessageStore } from '../pending-message';

const KEY = 'syd:pendingMessage';

beforeEach(() => {
    sessionStorage.clear();
    pendingMessageStore.clear();
    jest.useRealTimers();
});

it('comes back after the redirect, once', () => {
    pendingMessageStore.set('Sì, procedi con il rendering');
    pendingMessageStore.keepForRedirect();
    pendingMessageStore.clear(); // the page reloads: memory is gone

    pendingMessageStore.restoreAfterRedirect();

    expect(pendingMessageStore.get()).toBe('Sì, procedi con il rendering');
    expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('is dropped when the user comes back too late', () => {
    jest.useFakeTimers({ now: new Date('2026-10-29T10:00:00Z') });
    pendingMessageStore.set('Sì, procedi');
    pendingMessageStore.keepForRedirect();
    pendingMessageStore.clear();
    jest.setSystemTime(new Date('2026-10-29T10:31:00Z'));

    pendingMessageStore.restoreAfterRedirect();

    expect(pendingMessageStore.get()).toBe('');
});

it('stores nothing without a message, and ignores what it cannot read', () => {
    pendingMessageStore.keepForRedirect();
    expect(sessionStorage.getItem(KEY)).toBeNull();

    sessionStorage.setItem(KEY, '{not json');
    pendingMessageStore.restoreAfterRedirect();
    expect(pendingMessageStore.get()).toBe('');
    expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('tells its subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = pendingMessageStore.subscribe(listener);
    pendingMessageStore.set('Sì');
    unsubscribe();
    pendingMessageStore.clear();

    expect(listener).toHaveBeenCalledTimes(1);
});
