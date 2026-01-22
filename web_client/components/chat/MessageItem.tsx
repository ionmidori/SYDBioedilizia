import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { ImagePreview } from '@/components/chat/ImagePreview';
import { ToolStatus } from '@/components/chat/ToolStatus';
import { cn } from '@/lib/utils';

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

interface MessageItemProps {
    message: Message;
    index: number;
    onImageClick: (imageUrl: string) => void;
}

/**
 * Single message item component
 * Handles rendering of one chat message with its avatar, content, and attachments
 * ✅ Memoized to prevent unnecessary re-renders
 */
export const MessageItem = React.memo<MessageItemProps>(({ message, index, onImageClick }) => {
    // Helper: Extract text from both old (content) and new (parts[]) formats
    const getMessageText = (msg: any): string => {
        if (msg.parts && Array.isArray(msg.parts)) {
            return msg.parts
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('');
        }
        return msg.content || '';
    };

    const text = getMessageText(message);
    const hasTools = message.toolInvocations?.length ?? 0 > 0;

    // ✅ Memoize ReactMarkdown components to prevent re-creation on every render
    const markdownComponents = useMemo(() => ({
        img: ({ node, ...props }: any) => props.src ? (
            <ImagePreview
                src={String(props.src)}
                alt={String(props.alt || 'Generated image')}
                onClick={onImageClick}
            />
        ) : null
    }), [onImageClick]);

    // Hide empty assistant placeholders
    if (message.role === 'assistant' && !text && !hasTools) {
        return null;
    }

    return (
        <motion.div
            key={message.id || index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "flex gap-3 max-w-[90%]",
                message.role === 'user' ? "ml-auto flex-row-reverse" : ""
            )}
        >
            {/* Avatar */}
            {message.role === 'user' ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border mt-1 bg-luxury-teal border-luxury-teal text-white">
                    <User className="w-4 h-4" />
                </div>
            ) : (
                <ArchitectAvatar className="w-8 h-8 mt-1 shrink-0" />
            )}

            {/* Message Bubble */}
            <div className={cn(
                "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                message.role === 'user'
                    ? "bg-luxury-teal text-white rounded-tr-none"
                    : "bg-luxury-bg/80 border border-luxury-gold/10 text-luxury-text rounded-tl-none"
            )}>
                {/* User Image Attachments */}
                {message.role === 'user' && message.attachments?.images && message.attachments.images.length > 0 && (
                    <div className="mb-3 space-y-2">
                        {message.attachments.images.map((imageUrl, imgIdx) => (
                            <ImagePreview
                                key={imgIdx}
                                src={imageUrl}
                                alt="Uploaded image"
                                onClick={onImageClick}
                                className="w-full rounded-lg"
                            />
                        ))}
                    </div>
                )}

                {/* Message Content */}
                <div className="prose prose-invert prose-p:my-1 prose-pre:bg-slate-900 prose-pre:p-2 prose-pre:rounded-lg max-w-none break-words">
                    {text ? (
                        <ReactMarkdown
                            urlTransform={(value) => value}
                            components={markdownComponents}
                        >
                            {text}
                        </ReactMarkdown>
                    ) : null}

                    {/* Tool Invocations */}
                    {message.toolInvocations?.map((tool, toolIdx) => (
                        <ToolStatus
                            key={toolIdx}
                            tool={tool}
                            onImageClick={onImageClick}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    );
});
