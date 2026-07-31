import { useEffect } from 'react';

interface UseOpenChatEventsOptions {
    setIsOpen: (open: boolean) => void;
    setInput: (input: string) => void;
}

/**
 * Listens for `OPEN_CHAT` / `OPEN_CHAT_WITH_MESSAGE` window events dispatched
 * by external triggers (Navbar, Hero CTAs, etc.) and opens the chat widget
 * accordingly, optionally pre-filling the input.
 */
export function useOpenChatEvents({ setIsOpen, setInput }: UseOpenChatEventsOptions): void {
    useEffect(() => {
        const handleOpenChat = () => setIsOpen(true);

        const handleOpenChatWithMessage = (e: Event) => {
            setIsOpen(true);
            const customEvent = e as CustomEvent;
            if (customEvent.detail?.message) {
                setInput(customEvent.detail.message);
            }
        };

        window.addEventListener('OPEN_CHAT', handleOpenChat);
        window.addEventListener('OPEN_CHAT_WITH_MESSAGE', handleOpenChatWithMessage);

        return () => {
            window.removeEventListener('OPEN_CHAT', handleOpenChat);
            window.removeEventListener('OPEN_CHAT_WITH_MESSAGE', handleOpenChatWithMessage);
        };
    }, [setIsOpen, setInput]);
}
