"use client";

import { useContext, createContext } from 'react';
import { ChatContextType } from '@/types/chat-context';

// Create the context with undefined initial value
export const ChatContext = createContext<ChatContextType | undefined>(undefined);

/**
 * Custom Hook to consume the Global Chat Context.
 * Ensures the component is wrapped in <ChatProvider>.
 * 
 * @throws Error if used outside of ChatProvider
 */
export function useChatContext(): ChatContextType {
    const context = useContext(ChatContext);

    if (context === undefined) {
        throw new Error('useChatContext must be used within a ChatProvider');
    }

    return context;
}
