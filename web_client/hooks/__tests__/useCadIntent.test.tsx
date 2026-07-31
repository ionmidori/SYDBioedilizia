import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useCadIntent } from '../useCadIntent';

jest.useFakeTimers();

function params(query: string): URLSearchParams {
    return new URLSearchParams(query);
}

describe('useCadIntent', () => {
    let replaceStateSpy: jest.SpyInstance;

    beforeEach(() => {
        window.history.replaceState({}, '', '/?intent=cad');
        replaceStateSpy = jest.spyOn(window.history, 'replaceState');
        jest.clearAllTimers();
    });

    afterEach(() => {
        replaceStateSpy.mockRestore();
    });

    it('sends the CAD survey message after 1s when intent=cad on a fresh conversation', async () => {
        const sendMessage = jest.fn().mockResolvedValue(undefined);
        renderHook(() =>
            useCadIntent({
                searchParams: params('intent=cad'),
                historyLoaded: true,
                isLoading: false,
                messagesLength: 0,
                sendMessage,
            })
        );

        await act(async () => { jest.advanceTimersByTime(1000); });

        expect(sendMessage).toHaveBeenCalledWith(
            'Vorrei effettuare un rilievo CAD di questa stanza. Mi aiuti a estrarre le misure?'
        );
    });

    it('strips the intent query param from the URL after sending', async () => {
        const sendMessage = jest.fn().mockResolvedValue(undefined);
        renderHook(() =>
            useCadIntent({
                searchParams: params('intent=cad'),
                historyLoaded: true,
                isLoading: false,
                messagesLength: 0,
                sendMessage,
            })
        );

        await act(async () => { jest.advanceTimersByTime(1000); });

        expect(replaceStateSpy).toHaveBeenCalled();
        const newUrl = replaceStateSpy.mock.calls[0][2] as string;
        expect(newUrl).not.toContain('intent=cad');
    });

    it('does not fire when intent is not "cad"', () => {
        const sendMessage = jest.fn();
        renderHook(() =>
            useCadIntent({
                searchParams: params('intent=other'),
                historyLoaded: true,
                isLoading: false,
                messagesLength: 0,
                sendMessage,
            })
        );

        jest.advanceTimersByTime(2000);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does not fire before history has loaded', () => {
        const sendMessage = jest.fn();
        renderHook(() =>
            useCadIntent({
                searchParams: params('intent=cad'),
                historyLoaded: false,
                isLoading: false,
                messagesLength: 0,
                sendMessage,
            })
        );

        jest.advanceTimersByTime(2000);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does not fire while a message is already loading', () => {
        const sendMessage = jest.fn();
        renderHook(() =>
            useCadIntent({
                searchParams: params('intent=cad'),
                historyLoaded: true,
                isLoading: true,
                messagesLength: 0,
                sendMessage,
            })
        );

        jest.advanceTimersByTime(2000);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does not fire once the conversation already has more than 2 messages', () => {
        const sendMessage = jest.fn();
        renderHook(() =>
            useCadIntent({
                searchParams: params('intent=cad'),
                historyLoaded: true,
                isLoading: false,
                messagesLength: 3,
                sendMessage,
            })
        );

        jest.advanceTimersByTime(2000);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('clears the pending timeout on unmount', () => {
        const sendMessage = jest.fn();
        const { unmount } = renderHook(() =>
            useCadIntent({
                searchParams: params('intent=cad'),
                historyLoaded: true,
                isLoading: false,
                messagesLength: 0,
                sendMessage,
            })
        );

        unmount();
        jest.advanceTimersByTime(2000);
        expect(sendMessage).not.toHaveBeenCalled();
    });
});
