import { useEffect } from 'react';
import { CHAT_EVENTS, type OpenChatDetail } from '@/lib/chat-events';

interface UseOpenChatEventsOptions {
    setIsOpen: (open: boolean) => void;
    setInput: (input: string) => void;
}

/**
 * Listens for the chat window events (`CHAT_EVENTS`, sent by `openChat()` from
 * the Hero CTAs, service cards, etc.) and opens the chat widget accordingly,
 * optionally pre-filling the input.
 */
export function useOpenChatEvents({ setIsOpen, setInput }: UseOpenChatEventsOptions): void {
    useEffect(() => {
        const handleOpenChat = () => setIsOpen(true);

        const handleOpenChatWithMessage = (e: CustomEvent<OpenChatDetail>) => {
            setIsOpen(true);
            if (e.detail?.message) {
                setInput(e.detail.message);
            }
        };

        window.addEventListener(CHAT_EVENTS.open, handleOpenChat);
        window.addEventListener(CHAT_EVENTS.openWithMessage, handleOpenChatWithMessage);

        return () => {
            window.removeEventListener(CHAT_EVENTS.open, handleOpenChat);
            window.removeEventListener(CHAT_EVENTS.openWithMessage, handleOpenChatWithMessage);
        };
    }, [setIsOpen, setInput]);
}
