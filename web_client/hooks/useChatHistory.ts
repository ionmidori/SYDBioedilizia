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

        const loadHistory = async () => {
            try {
                console.log("[useChatHistory] Loading conversation history...");
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
                } else {
                    console.error("[useChatHistory] Failed to load history:", response.status);
                }

                setHistoryLoaded(true);
            } catch (error) {
                console.error("[useChatHistory] Error loading history:", error);
                setHistoryLoaded(true);
            }
        };

        loadHistory();
    }, [sessionId]);

    return { historyLoaded, historyMessages };
}
