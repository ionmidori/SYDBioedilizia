import { useState, useEffect } from 'react';

/**
 * Custom hook for managing contextual typing indicator messages
 * Extracted from ChatWidget.tsx (lines 220, 238-261)
 */
export function useTypingIndicator(isLoading: boolean) {
    const [typingMessage, setTypingMessage] = useState('SYD sta pensando...');

    useEffect(() => {
        if (!isLoading) {
            setTypingMessage('Sto pensando...');
            return;
        }

        const typingMessages = [
            'Sto analizzando...',
            'Sto elaborando la risposta...',
            'Sto disegnando...',
            'Quasi pronto...'
        ];

        let index = 0;
        setTypingMessage(typingMessages[0]);

        const interval = setInterval(() => {
            index = (index + 1) % typingMessages.length;
            setTypingMessage(typingMessages[index]);
        }, 2000);

        return () => clearInterval(interval);
    }, [isLoading]);

    return typingMessage;
}
