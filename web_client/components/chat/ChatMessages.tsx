import React, { RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { MessageItem } from '@/components/chat/MessageItem';
import { ReasoningStepView } from '@/components/chat/ReasoningStepView';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
// import { ThinkingSurface } from '@/components/chat/ThinkingSurface'; // Deferred
import { ToolStatus } from '@/components/chat/ToolStatus';
import { Message } from '@/types/chat'; // ✅ Message interface compatible with AI SDK
import { ReasoningStep } from '@/types/reasoning'; // 🔥 CoT Types

interface ChatMessagesProps {
    messages: Message[];
    isLoading: boolean;
    typingMessage?: string | null;
    sessionId?: string | null;
    onImageClick?: (url: string) => void;

    // Status Logic 
    statusMessage?: string | null;

    // 🔥 NEW: CoT Data Stream
    data?: any[];

    messagesContainerRef: RefObject<HTMLDivElement>;
    messagesEndRef: RefObject<HTMLDivElement>;
    onFormSubmit?: (data: any) => void;
}

const scrollStyle = { WebkitOverflowScrolling: 'touch' as const };

const ChatMessagesComponent = ({
    messages,
    isLoading,
    typingMessage,
    sessionId,
    onImageClick,
    statusMessage,
    data, // Capture data
    messagesContainerRef,
    messagesEndRef,
    onFormSubmit
}: ChatMessagesProps) => {

    // 🧠 Extract latest reasoning step from data stream
    const latestReasoning = React.useMemo(() => {
        if (!data || data.length === 0) return null;
        // Search backwards for the last "reasoning" event
        for (let i = data.length - 1; i >= 0; i--) {
            const item = data[i] as any;
            if (item && item.type === 'reasoning') {
                return item.data as ReasoningStep;
            }
        }
        return null;
    }, [data]);

    return (
        <div
            ref={messagesContainerRef}
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
                            onFormSubmit={onFormSubmit}
                        />
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* AI Processing State - Dynamic Status */}
            {/* 🔒 FIX: Strict Loading Gate - Only show when actually loading */}
            {isLoading && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex gap-3"
                >
                    <ArchitectAvatar className="w-8 h-8 shrink-0" />
                    <div className="pl-2">
                        <ThinkingIndicator
                            message={typingMessage || undefined}
                            statusMessage={statusMessage || undefined}
                            reasoningData={latestReasoning}
                        />
                    </div>
                </motion.div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
};

// ✅ Memoize component to prevent re-renders when props haven't changed
export const ChatMessages = React.memo(ChatMessagesComponent);
