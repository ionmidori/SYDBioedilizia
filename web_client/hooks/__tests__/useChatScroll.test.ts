import { renderHook } from '@testing-library/react';
import { useChatScroll } from '../useChatScroll';
import { act } from 'react';

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
        const { result, rerender } = renderHook(
            ({ count, isOpen }) => useChatScroll(count, isOpen),
            { initialProps: { count: 1, isOpen: true } }
        );

        // Create mock elements
        const mockContainer = document.createElement('div');
        const mockEnd = document.createElement('div');
        Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, writable: true });
        Object.defineProperty(mockContainer, 'scrollTop', { value: 0, writable: true });

        // @ts-ignore - assign mock elements to refs
        result.current.messagesContainerRef.current = mockContainer;
        result.current.messagesEndRef.current = mockEnd;

        const scrollIntoViewSpy = jest.spyOn(mockEnd, 'scrollIntoView');

        // Increase message count
        rerender({ count: 2, isOpen: true });

        expect(scrollIntoViewSpy).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'end',
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

        expect(scrollIntoViewSpy).toHaveBeenCalledWith({
            behavior: 'instant',
            block: 'end',
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
        });
    });

    it('should set container scrollTop when available', () => {
        const { result, rerender } = renderHook(
            ({ count, isOpen }) => useChatScroll(count, isOpen),
            { initialProps: { count: 1, isOpen: true } }
        );

        const mockContainer = document.createElement('div');
        Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, writable: true });
        Object.defineProperty(mockContainer, 'scrollTop', { value: 0, writable: true });

        // @ts-ignore
        result.current.messagesContainerRef.current = mockContainer;

        // Trigger scroll
        rerender({ count: 2, isOpen: true });

        expect(mockContainer.scrollTop).toBe(1000);
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
