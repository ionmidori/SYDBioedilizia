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
            "Spostando mobili immaginari...",
            "Litigando con l'idraulico virtuale...",
            "Calcolando lo spessore dell'intonaco quantistico...",
            "Versando il cemento nel metaverso...",
            "Riscaldando i neuroni...",
            "Contando i mattoni, uno per uno...",
            "Disegnando planimetrie mentali...",
            "Cercando la chiave a brugola perduta nel server...",
            "Dipingendo i pixel di fresco...",
            "Montando impalcature nel cloud...",
            "Abbattendo pareti di codice...",
            "Aspettando che il parquet si asciughi...",
            "Livellando l'architettura del database...",
            "Mettendo in bolla l'interfaccia utente...",
            "Spazzando via i calcinacci dai log...",
            "Lucidando i rendering 3D con olio di gomito...",
            "Stuccando le crepe di sistema...",
            "Facendo amicizia con l'elettricista...",
            "Allineando i chakra digitali del cantiere...",
            "Generando planimetrie e magia...",
            "Un attimo, sto pensando forte...",
            "Consultando le stelle e il catasto..."
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
