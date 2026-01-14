import { useState, useEffect } from 'react';

interface Message {
    id: string;
    role: string;
    content: string;
}

/**
 * Custom hook for loading chat history from Firestore
 * Extracted from ChatWidget.tsx (lines 47-87)
 */
export function useChatHistory(sessionId: string) {
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [historyMessages, setHistoryMessages] = useState<Message[]>([]);

    useEffect(() => {
        console.log("[useChatHistory] Initialized with sessionId:", sessionId);

        const loadHistory = async (retries = 3, delay = 1000) => {
            try {
                console.log(`[useChatHistory] Loading conversation history... (Attempt ${4 - retries})`);
                const response = await fetch(`/api/chat/history?sessionId=${sessionId}`);

                if (response.ok) {
                    const data = await response.json();

                    if (data.messages && data.messages.length > 0) {
                        console.log(`[useChatHistory] Loaded ${data.messages.length} messages from history`);

                        const historyMessages = data.messages.map((msg: any, idx: number) => ({
                            id: `history-${idx}`,
                            role: msg.role,
                            content: msg.content,
                        }));

                        setHistoryMessages(historyMessages);
                    } else {
                        console.log("[useChatHistory] No previous messages found - starting fresh");
                    }
                    setHistoryLoaded(true);
                } else {
                    console.error("[useChatHistory] Failed to load history:", response.status);
                    throw new Error(`Server returned ${response.status}`);
                }

            } catch (error) {
                console.error("[useChatHistory] Error loading history:", error);

                if (retries > 0) {
                    console.log(`[useChatHistory] Retrying in ${delay}ms...`);
                    setTimeout(() => loadHistory(retries - 1, delay * 2), delay);
                } else {
                    setHistoryLoaded(true); // Give up but unblock UI
                }
            }
        };

        loadHistory();
    }, [sessionId]);

    return { historyLoaded, historyMessages };
}
