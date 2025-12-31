import React, { RefObject } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { ImagePreview } from '@/components/chat/ImagePreview';
import { cn } from '@/lib/utils';

interface Message {
    id: string;
    role: string;
    content: string;
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
 * Chat messages list component with markdown rendering
 * Extracted from ChatWidget.tsx (lines 528-559)
 * ✅ BUG FIX #14: Refactored to use ImagePreview component
 */
export function ChatMessages({
    messages,
    isLoading,
    typingMessage,
    onImageClick,
    messagesContainerRef,
    messagesEndRef
}: ChatMessagesProps) {
    // Debug: Log message structure
    console.log('[ChatMessages] Total messages:', messages.length);
    messages.forEach((m, i) => {
        const content = String(((m) as any).content || '');
        console.log(`[ChatMessages] Message ${i} (${m.role}):`, {
            hasToolInvocations: !!((m as any).toolInvocations),
            contentLength: content.length,
            hasMarkdownImage: content.includes('!['),
            contentPreview: content.substring(0, 200)
        });
        if ((m as any).toolInvocations) {
            console.log(`[ChatMessages] Message ${i} toolInvocations:`, (m as any).toolInvocations);
        }
    });

    return (
        <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent overscroll-contain touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            {messages.map((msg, idx) => (
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex gap-3 max-w-[90%]", msg.role === 'user' ? "ml-auto flex-row-reverse" : "")}
                >
                    {msg.role === 'user' ? (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border mt-1 bg-blue-600 border-blue-500 text-white">
                            <User className="w-4 h-4" />
                        </div>
                    ) : (
                        <ArchitectAvatar className="w-8 h-8 mt-1 shrink-0" />
                    )}
                    <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                        msg.role === 'user'
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none"
                    )}>
                        <div className="prose prose-invert prose-p:my-1 prose-pre:bg-slate-900 prose-pre:p-2 prose-pre:rounded-lg max-w-none break-words">
                            <ReactMarkdown
                                urlTransform={(value) => value}
                                components={{
                                    img: ({ node, ...props }) => props.src ? (
                                        <ImagePreview
                                            src={String(props.src)}
                                            alt={String(props.alt || 'Generated image')}
                                            onClick={onImageClick}
                                        />
                                    ) : null
                                }}
                            >
                                {String((msg as any).content || '')}
                            </ReactMarkdown>

                            {/* ✅ Render tool invocations (e.g., generated images) */}
                            {(msg as any).toolInvocations?.map((tool: any, toolIdx: number) => {
                                if (tool.toolName === 'generate_render' && tool.state === 'result') {
                                    const result = tool.result || (tool as any).output;
                                    // Check for imageUrl
                                    if (result?.imageUrl) {
                                        return (
                                            <div key={toolIdx} className="mt-3">
                                                <ImagePreview
                                                    src={result.imageUrl}
                                                    alt={result.description || 'Rendering generato'}
                                                    onClick={onImageClick}
                                                    className="w-full"
                                                />
                                            </div>
                                        );
                                    } else if (result?.error || result?.status === 'error') {
                                        return (
                                            <div key={toolIdx} className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                                <p className="font-medium">Errore generazione immagine:</p>
                                                <p>{result?.error || 'Si è verificato un errore sconosciuto.'}</p>
                                            </div>
                                        );
                                    }
                                }
                                return null;
                            })}
                        </div>
                    </div>
                </motion.div>
            ))}

            {isLoading && (
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
}
