import React, { RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { MessageItem } from '@/components/chat/MessageItem';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';

// ✅ Message interface compatible with AI SDK
import { Message } from '@/types/chat';

interface ChatMessagesProps {
    messages: Message[];
    isLoading: boolean;
    typingMessage?: string | null;  // Converted to optional to match usage
    sessionId?: string | null;
    onImageClick?: (url: string) => void;
    // Status Logic 
    statusMessage?: string | null;
    messagesContainerRef: RefObject<HTMLDivElement>;
    messagesEndRef: RefObject<HTMLDivElement>;
}

/**
 * Chat messages list component - Refactored for maintainability
 * ✅ Delegates individual message rendering to MessageItem
 * ✅ Reduced cyclomatic complexity by extracting tool status logic
 */
const scrollStyle = { WebkitOverflowScrolling: 'touch' as const };

const ChatMessagesComponent = ({
    messages,
    isLoading,
    typingMessage,
    sessionId,
    onImageClick,
    statusMessage,
    messagesContainerRef,
    messagesEndRef
}: ChatMessagesProps) => {
    return (

        <div
            ref={messagesContainerRef as any}
            className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-luxury-gold/20 scrollbar-track-transparent overscroll-contain touch-pan-y"
            style={scrollStyle}
        >
            <motion.div
                layout
                className="flex flex-col space-y-6"
            >
                <AnimatePresence initial={false} mode="popLayout">
                    {messages.map((msg, idx) => (
                        <MessageItem
                            key={msg.id || idx}
                            message={msg}
                            typingMessage={typingMessage || undefined}
                            sessionId={sessionId || ""}
                            onImageClick={onImageClick || (() => { })}
                        />
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* AI Processing State - Dynamic Status */}
            {(isLoading || typingMessage) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex gap-3"
                >
                    <ArchitectAvatar className="w-8 h-8 shrink-0" />
                    <div className="bg-luxury-bg/80 border border-luxury-gold/10 p-4 rounded-2xl rounded-tl-none shadow-premium backdrop-blur-sm">
                        <ThinkingIndicator
                            message={typingMessage || undefined}
                            statusMessage={statusMessage}
                        />
                    </div>
                </motion.div>
            )}

            <div ref={messagesEndRef as any} />
        </div>
    );
};

// ✅ Memoize component to prevent re-renders when props haven't changed
export const ChatMessages = React.memo(ChatMessagesComponent);

