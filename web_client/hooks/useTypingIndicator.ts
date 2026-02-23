import { useState, useEffect } from 'react';

/**
 * Custom hook for managing contextual typing indicator messages
 * Extracted from ChatWidget.tsx (lines 220, 238-261)
 */
export function useTypingIndicator(isLoading: boolean) {
    const [typingMessage, setTypingMessage] = useState("Consultando l'architetto interiore...");

    useEffect(() => {
        if (!isLoading) {
            setTypingMessage("Consultando l'architetto interiore...");
            return;
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

        // Pick random start
        let index = Math.floor(Math.random() * typingMessages.length);
        setTypingMessage(typingMessages[index]);

        const interval = setInterval(() => {
            index = (index + 1) % typingMessages.length;
            setTypingMessage(typingMessages[index]);
        }, 3000);

        return () => clearInterval(interval);
    }, [isLoading]);

    return typingMessage;
}
