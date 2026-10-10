import React, { RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { MessageItem } from '@/components/chat/MessageItem';
import { Message } from '@/types/chat'; // ✅ Message interface compatible with AI SDK
import { ReasoningStep } from '@/types/reasoning'; // 🔥 CoT Types
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { hasVisibleText } from '@/lib/chat/message-text';

interface ChatMessagesProps {
    messages: Message[];
    /** Firestore history, used by MessageItem for fields the AI SDK strips. */
    historyMessages?: Message[];
    isLoading: boolean;
    typingMessage?: string | null;
    sessionId?: string | null;
    onImageClick?: (url: string) => void;

    // Status Logic 
    statusMessage?: string | null;

    // 🔥 NEW: CoT Data Stream
    data?: unknown[];

    messagesContainerRef: RefObject<HTMLDivElement | null>;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    onFormSubmit?: (data: unknown) => void;
}

const scrollStyle = { WebkitOverflowScrolling: 'touch' as const };
// Module-level so MessageItem's memo sees the same function on every render.
const noopImageClick = () => {};

const ChatMessagesComponent = ({
    messages,
    historyMessages,
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

    const historyById = React.useMemo(
        () => new Map((historyMessages ?? []).map(m => [m.id, m])),
        [historyMessages]
    );

    // 🧠 Extract latest reasoning step from data stream
    const latestReasoning = React.useMemo(() => {
        if (!data || data.length === 0) return null;
        // Search backwards for the last "reasoning" event
        for (let i = data.length - 1; i >= 0; i--) {
            const item = data[i] as { type?: string; data?: unknown };
            if (item && item.type === 'reasoning') {
                return item.data as ReasoningStep;
            }
        }
        return null;
    }, [data]);


    // With token streaming the reply itself shows progress: hide the "thinking"
    // indicator as soon as the assistant message has visible text.
    const lastMessage = messages[messages.length - 1];
    const assistantIsWriting =
        lastMessage?.role === 'assistant' &&
        hasVisibleText(lastMessage.parts as { type: string; text?: unknown; data?: unknown }[] | undefined);
    const showThinking = isLoading && !assistantIsWriting;

    // Replies streamed live in this tab (not restored from history) get the
    // progressive reveal. State adjusted during render (React's documented
    // pattern for derived state): runs once per new live reply.
    const [liveReplyIds, setLiveReplyIds] = React.useState<ReadonlySet<string>>(() => new Set());
    const liveCandidate = isLoading && lastMessage?.role === 'assistant' ? lastMessage.id : undefined;
    if (liveCandidate && !liveReplyIds.has(liveCandidate)) {
        setLiveReplyIds(new Set(liveReplyIds).add(liveCandidate));
    }

    return (
        <div
            ref={messagesContainerRef}
            data-testid="chat-messages"
            className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-luxury-gold/20 scrollbar-track-transparent overscroll-contain touch-pan-y"
            style={scrollStyle}
        >
            {/* No `layout` / popLayout: messages never reorder, and layout (FLIP)
                animations scale content on every height change while a reply streams. */}
            <div className="flex flex-col space-y-6">
                <AnimatePresence initial={false}>
                    {messages.map((msg, idx) => (
                        <MessageItem
                            key={msg.id || idx}
                            message={msg}
                            sessionId={sessionId || ""}
                            onImageClick={onImageClick || noopImageClick}
                            onFormSubmit={onFormSubmit}
                            historyMessage={msg.id ? historyById.get(msg.id) : undefined}
                            animate={!!msg.id && liveReplyIds.has(msg.id)}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* AI Processing State - Dynamic Status */}
            {/* 🔒 FIX: Strict Loading Gate - Only show when actually loading */}
            {showThinking && (
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
