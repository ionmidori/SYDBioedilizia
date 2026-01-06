import React, { RefObject } from 'react';
import { motion } from 'framer-motion';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { MessageItem } from '@/components/chat/MessageItem';

// ✅ Message interface compatible with AI SDK
interface Message {
    id: string;
    role: string;
    content: string;
    toolInvocations?: Array<{
        toolCallId: string;
        toolName: string;
        state: 'call' | 'result';
        args?: any;
        result?: any;
    }>;
    attachments?: {
        images?: string[];
    };
}

interface ChatMessagesProps {
    messages: Message[];
    isLoading: boolean;
    typingMessage: string;
    onImageClick: (imageUrl: string) => void;
    messagesContainerRef: RefObject<HTMLDivElement | null>;
    messagesEndRef: RefObject<HTMLDivElement | null>;
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
    onImageClick,
    messagesContainerRef,
    messagesEndRef
}: ChatMessagesProps) => {
    return (
        <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent overscroll-contain touch-pan-y"
            style={scrollStyle}
        >
            {/* Render all messages */}
            {messages.map((msg, idx) => (
                <MessageItem
                    key={msg.id || idx}
                    message={msg}
                    index={idx}
                    onImageClick={onImageClick}
                />
            ))}

            {/* Loading indicator (Only show if NO active tool is running to prevent double messages) */}
            {isLoading && !messages[messages.length - 1]?.toolInvocations?.some(t => t.state === 'call') && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                >
                    <ArchitectAvatar className="w-8 h-8 shrink-0" />
                    <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-tl-none">
                        <div className="flex items-center gap-3">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                            </div>
                            <motion.span
                                key={typingMessage}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs text-slate-400 font-medium"
                            >
                                {typingMessage}
                            </motion.span>
                        </div>
                    </div>
                </motion.div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
};

// ✅ Memoize component to prevent re-renders when props haven't changed
export const ChatMessages = React.memo(ChatMessagesComponent);

