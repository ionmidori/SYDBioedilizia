import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useOpenChatEvents } from '../useOpenChatEvents';

describe('useOpenChatEvents', () => {
    it('opens the chat on OPEN_CHAT', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        act(() => { window.dispatchEvent(new Event('OPEN_CHAT')); });

        expect(setIsOpen).toHaveBeenCalledWith(true);
        expect(setInput).not.toHaveBeenCalled();
    });

    it('opens the chat and pre-fills the input on OPEN_CHAT_WITH_MESSAGE', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        act(() => {
            window.dispatchEvent(new CustomEvent('OPEN_CHAT_WITH_MESSAGE', { detail: { message: 'Ciao!' } }));
        });

        expect(setIsOpen).toHaveBeenCalledWith(true);
        expect(setInput).toHaveBeenCalledWith('Ciao!');
    });

    it('opens the chat without prefilling when OPEN_CHAT_WITH_MESSAGE has no detail.message', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        act(() => { window.dispatchEvent(new CustomEvent('OPEN_CHAT_WITH_MESSAGE')); });

        expect(setIsOpen).toHaveBeenCalledWith(true);
        expect(setInput).not.toHaveBeenCalled();
    });

    it('removes both listeners on unmount', () => {
        const setIsOpen = jest.fn();
        const setInput = jest.fn();
        const { unmount } = renderHook(() => useOpenChatEvents({ setIsOpen, setInput }));

        unmount();
        act(() => {
            window.dispatchEvent(new Event('OPEN_CHAT'));
            window.dispatchEvent(new CustomEvent('OPEN_CHAT_WITH_MESSAGE', { detail: { message: 'late' } }));
        });

        expect(setIsOpen).not.toHaveBeenCalled();
        expect(setInput).not.toHaveBeenCalled();
    });
});
