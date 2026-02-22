import { renderHook } from '@testing-library/react';
import { useChatScroll } from '../useChatScroll';
import { act } from 'react';

// Enable fake timers for setTimeout-based scroll
jest.useFakeTimers();

describe('useChatScroll', () => {
    beforeEach(() => {
        // Mock scrollIntoView
        Element.prototype.scrollIntoView = jest.fn();
    });

    it('should initialize with refs', () => {
        const { result } = renderHook(() => useChatScroll(0, false));

        expect(result.current.messagesContainerRef).toBeDefined();
        expect(result.current.messagesEndRef).toBeDefined();
        expect(result.current.scrollToBottom).toBeInstanceOf(Function);
    });

    it('should return stable refs across re-renders', () => {
        const { result, rerender } = renderHook(() => useChatScroll(0, false));

        const firstContainerRef = result.current.messagesContainerRef;
        const firstEndRef = result.current.messagesEndRef;

        rerender();

        expect(result.current.messagesContainerRef).toBe(firstContainerRef);
        expect(result.current.messagesEndRef).toBe(firstEndRef);
    });

    it('should scroll to bottom when messages increase', () => {
        // Start with chat closed so initial scroll doesn't fire before refs are set
        const { result, rerender } = renderHook(
            ({ count, isOpen }) => useChatScroll(count, isOpen),
            { initialProps: { count: 1, isOpen: false } }
        );

        // Create mock elements and assign refs
        // clientHeight must be close to scrollHeight so isNearBottomRef stays true
        const mockContainer = document.createElement('div');
        const mockEnd = document.createElement('div');
        Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, writable: true });
        Object.defineProperty(mockContainer, 'scrollTop', { value: 950, writable: true });
        Object.defineProperty(mockContainer, 'clientHeight', { value: 100, writable: true });

        // @ts-ignore - assign mock elements to refs
        result.current.messagesContainerRef.current = mockContainer;
        result.current.messagesEndRef.current = mockEnd;

        const scrollIntoViewSpy = jest.spyOn(mockEnd, 'scrollIntoView');

        // Open chat first (clears initial scroll via setTimeout)
        act(() => { rerender({ count: 1, isOpen: true }); });
        act(() => { jest.advanceTimersByTime(50); }); // flush setTimeout (instant scroll fires)

        // Clear calls from the initial open scroll
        scrollIntoViewSpy.mockClear();

        // Increase message count — should trigger smooth scroll
        act(() => { rerender({ count: 2, isOpen: true }); });

        expect(scrollIntoViewSpy).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest',
        });
    });

    it('should use instant scroll when chat opens', () => {
        const { result, rerender } = renderHook(
            ({ count, isOpen }) => useChatScroll(count, isOpen),
            { initialProps: { count: 1, isOpen: false } }
        );

        const mockEnd = document.createElement('div');
        // @ts-ignore
        result.current.messagesEndRef.current = mockEnd;

        const scrollIntoViewSpy = jest.spyOn(mockEnd, 'scrollIntoView');

        // Open chat
        rerender({ count: 1, isOpen: true });

        // Hook uses setTimeout(50ms) for initial scroll when opening
        act(() => { jest.advanceTimersByTime(50); });

        expect(scrollIntoViewSpy).toHaveBeenCalledWith({
            behavior: 'instant',
            block: 'end',
            inline: 'nearest',
        });
    });

    it('should scroll to bottom manually when function is called', () => {
        const { result } = renderHook(() => useChatScroll(0, false));

        const mockContainer = document.createElement('div');
        const mockEnd = document.createElement('div');
        Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, writable: true });
        Object.defineProperty(mockContainer, 'scrollTop', { value: 0, writable: true });

        // @ts-ignore
        result.current.messagesContainerRef.current = mockContainer;
        result.current.messagesEndRef.current = mockEnd;

        const scrollIntoViewSpy = jest.spyOn(mockEnd, 'scrollIntoView');

        act(() => {
            result.current.scrollToBottom('auto');
        });

        expect(scrollIntoViewSpy).toHaveBeenCalledWith({
            behavior: 'auto',
            block: 'end',
            inline: 'nearest',
        });
    });

    it('should call scrollIntoView when messages increase with container available', () => {
        const { result, rerender } = renderHook(
            ({ count, isOpen }) => useChatScroll(count, isOpen),
            { initialProps: { count: 1, isOpen: false } }
        );

        const mockContainer = document.createElement('div');
        const mockEnd = document.createElement('div');
        Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, writable: true });
        // scrollTop near bottom so isNearBottomRef stays true
        Object.defineProperty(mockContainer, 'scrollTop', { value: 950, writable: true });
        Object.defineProperty(mockContainer, 'clientHeight', { value: 100, writable: true });

        // @ts-ignore
        result.current.messagesContainerRef.current = mockContainer;
        result.current.messagesEndRef.current = mockEnd;

        // Open chat and flush initial instant-scroll setTimeout before creating spy
        act(() => { rerender({ count: 1, isOpen: true }); });
        act(() => { jest.advanceTimersByTime(50); });

        // Attach spy after initial scroll is flushed
        const scrollIntoViewSpy = jest.spyOn(mockEnd, 'scrollIntoView');

        // Trigger smooth scroll by increasing count
        act(() => { rerender({ count: 2, isOpen: true }); });

        // Hook scrolls via scrollIntoView (iOS-compatible approach)
        expect(scrollIntoViewSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    });

    it('should handle null refs gracefully', () => {
        const { result, rerender } = renderHook(
            ({ count, isOpen }) => useChatScroll(count, isOpen),
            { initialProps: { count: 1, isOpen: true } }
        );

        // Leave refs as null
        expect(() => {
            rerender({ count: 2, isOpen: true });
        }).not.toThrow();
    });
});
