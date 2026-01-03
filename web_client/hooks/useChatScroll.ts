import { useRef, useEffect } from 'react';

/**
 * Custom hook for managing auto-scroll behavior in chat messages
 * Extracted from ChatWidget.tsx (lines 232-280)
 */
export function useChatScroll(messagesLength: number, isOpen: boolean) {
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const prevMessagesLengthRef = useRef(messagesLength);

    // Auto-scroll logic
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
        }
    };

    useEffect(() => {
        // Scroll when messages change or chat opens
        if (messagesLength !== prevMessagesLengthRef.current || isOpen) {
            scrollToBottom(isOpen && prevMessagesLengthRef.current === messagesLength ? 'instant' : 'smooth');
            prevMessagesLengthRef.current = messagesLength;
        }
    }, [messagesLength, isOpen]);

    return {
        messagesContainerRef,
        messagesEndRef,
        scrollToBottom
    };
}
