import { useState, useEffect } from 'react';

/**
 * Custom hook for managing contextual typing indicator messages
 * Extracted from ChatWidget.tsx (lines 220, 238-261)
 */
export function useTypingIndicator(isLoading: boolean) {
    const defaultMessage = "Consultando l'architetto interiore...";
    const [typingMessage, setTypingMessage] = useState(defaultMessage);

    useEffect(() => {
        let timerId: NodeJS.Timeout;

        if (!isLoading) {
            // Use timeout to avoid sync setState warning
            timerId = setTimeout(() => {
                setTypingMessage(prev => prev !== defaultMessage ? defaultMessage : prev);
            }, 0);
            return () => {
                if (timerId) clearTimeout(timerId);
            };
        }

        const typingMessages = [
            "Consultando l'architetto interiore...",
            "Spostando pixel pesanti...",
            "Riscaldando i neuroni...",
            "Contando fino a infinito (due volte)...",
            "Disegnando planimetrie mentali...",
            "Allineando i chakra digitali...",
            "Cercando l'ispirazione tra le nuvole...",
            "Evocando lo spirito del design...",
            "Mettendo in ordine i bit disordinati...",
            "Generando magia...",
            "Un attimo, sto pensando forte...",
            "Consultando le stelle...",
            "Lucidando i rendering..."
        ];

        // Pick random start - wrap in timeout to avoid sync setState warning
        timerId = setTimeout(() => {
            const index = Math.floor(Math.random() * typingMessages.length);
            setTypingMessage(typingMessages[index]);
        }, 0);

        let currentIndex = Math.floor(Math.random() * typingMessages.length);

        const interval = setInterval(() => {
            currentIndex = (currentIndex + 1) % typingMessages.length;
            setTypingMessage(typingMessages[currentIndex]);
        }, 3000);

        return () => {
            if (timerId) clearTimeout(timerId);
            if (interval) clearInterval(interval);
        };
    }, [isLoading]);

    return typingMessage;
}
