import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useOpenChatEvents } from '../useOpenChatEvents';
import { CHAT_EVENTS, openChat } from '@/lib/chat-events';

describe('useOpenChatEvents', () => {
    it('opens the chat on the open event', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        act(() => { window.dispatchEvent(new Event(CHAT_EVENTS.open)); });

        expect(setIsOpen).toHaveBeenCalledWith(true);
        expect(setInput).not.toHaveBeenCalled();
    });

    it('opens the chat and pre-fills the input on the open-with-message event', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        act(() => {
            window.dispatchEvent(new CustomEvent(CHAT_EVENTS.openWithMessage, { detail: { message: 'Ciao!' } }));
        });

        expect(setIsOpen).toHaveBeenCalledWith(true);
        expect(setInput).toHaveBeenCalledWith('Ciao!');
    });

    it('opens the chat without prefilling when the open-with-message event has no detail.message', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        act(() => { window.dispatchEvent(new CustomEvent(CHAT_EVENTS.openWithMessage)); });

        expect(setIsOpen).toHaveBeenCalledWith(true);
        expect(setInput).not.toHaveBeenCalled();
    });

    it('removes both listeners on unmount', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        const { unmount } = renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        unmount();
        act(() => {
            window.dispatchEvent(new Event(CHAT_EVENTS.open));
            window.dispatchEvent(new CustomEvent(CHAT_EVENTS.openWithMessage, { detail: { message: 'late' } }));
        });

        expect(setIsOpen).not.toHaveBeenCalled();
        expect(setInput).not.toHaveBeenCalled();
    });

    // openChat() is what the page calls: these pin that it reaches the listener.
    describe('openChat()', () => {
        it('opens the chat without touching the input', () => {
            const setIsOpen = jest.fn();
            const setInput = jest.fn();
            renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

            act(() => openChat());

            expect(setIsOpen).toHaveBeenCalledWith(true);
            expect(setInput).not.toHaveBeenCalled();
        });

        it('opens the chat and pre-fills the message', () => {
            const setIsOpen = jest.fn();
            const setInput = jest.fn();
            renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

            act(() => openChat('Vorrei rifare il bagno'));

            expect(setIsOpen).toHaveBeenCalledWith(true);
            expect(setInput).toHaveBeenCalledWith('Vorrei rifare il bagno');
        });
    });
});
