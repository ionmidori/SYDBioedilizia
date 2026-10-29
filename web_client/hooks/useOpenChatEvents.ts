import { useEffect } from 'react';
import { CHAT_EVENTS, type OpenChatDetail } from '@/lib/chat-events';
import { takeReopenChat } from '@/lib/chat/chat-window-state';

interface UseOpenChatEventsOptions {
    setIsOpen: (open: boolean) => void;
    setInput: (input: string) => void;
    /** Open once if a login that left the page had the chat open (the floating widget only). */
    reopenAfterLogin?: boolean;
}

/**
 * Listens for the chat window events (`CHAT_EVENTS`, sent by `openChat()` from
 * the Hero CTAs, service cards, etc.) and opens the chat widget accordingly,
 * optionally pre-filling the input. Also opens it on the way back from a login
 * that left the page with the chat open (redirect, magic link): after
 * hydration, so a prerendered page still renders it closed first.
 */
export function useOpenChatEvents({ setIsOpen, setInput, reopenAfterLogin = false }: UseOpenChatEventsOptions): void {
    useEffect(() => {
        if (reopenAfterLogin && takeReopenChat()) setIsOpen(true);
    }, [reopenAfterLogin, setIsOpen]);

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
