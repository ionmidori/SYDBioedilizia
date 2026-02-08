import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { ImagePreview } from '@/components/chat/ImagePreview';
import { ToolStatus } from '@/components/chat/ToolStatus';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { LeadCaptureForm } from '@/components/chat/widgets/LeadCaptureForm';
import { LoginRequest } from '@/components/chat/tools/LoginRequest';
import { ReasoningStepView } from '@/components/chat/ReasoningStepView';
import { cn } from '@/lib/utils';

import { Message, ReasoningStep } from '@/types/chat';

interface MessageItemProps {
    message: Message;
    index: number;
    typingMessage?: string;
    sessionId: string;
    onImageClick: (imageUrl: string) => void;
}

/**
 * Single message item component
 * Handles rendering of one chat message with its avatar, content, and attachments
 * ✅ Memoized to prevent unnecessary re-renders
 */
export const MessageItem = React.memo<MessageItemProps>(({ message, index, typingMessage, sessionId, onImageClick }) => {
    // Helper: Extract text from both old (content) and new (parts[]) formats
    const getMessageText = (msg: Message): string => {
        if (msg.parts && Array.isArray(msg.parts)) {
            return msg.parts
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('');
        }
        if (typeof msg.content === 'string') return msg.content;
        return JSON.stringify(msg.content || '');
    };

    // Fix for React 18/19 type mismatch
    const Markdown = ReactMarkdown as any;

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

    const variants = {
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { type: "spring", stiffness: 300, damping: 24 }
        },
        exit: {
            opacity: 0,
            scale: 0.9,
            transition: { duration: 0.2 }
        }
    };

    // Hide internal 'tool' and 'data' messages
    if (message.role === 'tool' || message.role === 'data') {
        return null;
    }

    // 💎 PREMIUM UI: Native Thinking State
    // Check if the message is in "Thinking Mode" (Assistant + Empty/Placeholder)
    const isThinking = message.role === 'assistant' && (!text || text.trim() === '' || text.trim() === '...') && !hasTools;

    // Check if tools have any visual output (Loading state OR Result with Image/Error OR Widgets)
    const hasVisibleTools = message.toolInvocations?.some(tool => {
        if (tool.toolName === 'display_lead_form') return true; // Always visible
        if (tool.toolName === 'request_login') return true; // 🔥 Login Widget Always visible

        // 🧠 Thinking State: Only visible while "calling" (thinking). 
        // Once done, it disappears (state='result' returns false), preventing empty bubble.
        if (tool.toolName === 'processing_request') {
            return tool.state === 'call';
        }

        if (tool.state === 'call') return true; // Loading of other tools is always visible

        const result = tool.result || (tool as any).output;

        // 🔥 GLOBAL AUTH INTERCEPT:
        // If ANY tool returns the specific Auth Signal or is the explicit 'request_login' tool, 
        // we must show the bubble to render the LoginRequest widget.
        if (tool.toolName === 'request_login') return true;
        if (typeof result === 'string' && result.includes('LOGIN_REQUIRED_UI_TRIGGER')) return true;

        // Only results with images/gallery or errors are visible in ToolStatus
        // Text results (like pricing) return null in ToolStatus, so we hide the bubble to avoid empty padding.
        if (tool.toolName === 'show_project_gallery') return true;
        return !!result?.imageUrl || !!result?.error || result?.status === 'error';
    }) ?? false;

    // Determine if the bubble (AND the entire row) should be visible
    const shouldShow =
        isThinking ||
        (text && text.trim().length > 0) ||
        hasVisibleTools ||
        (message.attachments?.images && message.attachments.images.length > 0); // User images

    if (!shouldShow) return null;

    return (
        <motion.div
            layout
            variants={variants as any} // Cast to any to bypass strict framer-motion types
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
                "flex gap-3 max-w-[90%]",
                message.role === 'user' ? "ml-auto flex-row-reverse" : "items-start"
            )}
        >
            {/* Avatar */}
            {message.role === 'user' ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border mt-1 bg-luxury-teal border-luxury-teal text-white shadow-sm">
                    <User className="w-4 h-4" />
                </div>
            ) : (
                <ArchitectAvatar className="w-8 h-8 mt-1 shrink-0" />
            )}

            {/* Message Content Stack (Split Bubbles for User) */}
            <div className={cn("flex flex-col gap-2 min-w-0 font-light", message.role === 'user' ? "items-end" : "items-start")}>

                {/* 0. AI Reasoning Panel (Chain of Thought) */}
                {message.role === 'assistant' && message.reasoning && (
                    <ReasoningStepView reasoning={message.reasoning as ReasoningStep | string} />
                )}

                {/* 1. User Images Bubble (Visual Only) */}
                {message.role === 'user' && message.attachments?.images && message.attachments.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-end">
                        {message.attachments.images.map((imageUrl, imgIdx) => (
                            <div key={imgIdx} className="overflow-hidden rounded-2xl shadow-sm border border-luxury-text/10 max-w-[200px]">
                                <ImagePreview
                                    src={imageUrl}
                                    alt="Uploaded image"
                                    onClick={onImageClick}
                                    className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500"
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* 2. Main Text Bubble */}
                {shouldShow && (
                    <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed shadow-lg backdrop-blur-md",
                        message.role === 'user'
                            ? "bg-luxury-teal text-white rounded-tr-none border border-transparent"
                            : "bg-luxury-bg/95 border border-luxury-gold/20 text-luxury-text rounded-tl-none" // Stronger Glass
                    )}>
                        <div className="prose prose-invert prose-p:my-1 prose-pre:bg-slate-900 prose-pre:p-2 prose-pre:rounded-lg max-w-none break-words">
                            {isThinking ? (
                                <ThinkingIndicator message={typingMessage} />
                            ) : (
                                <>
                                    {text && (
                                        <Markdown
                                            urlTransform={(value: string) => value}
                                            components={markdownComponents as any}
                                        >
                                            {/* Strip leading "..." if present (artifact of Zero-Latency Hack) */}
                                            {text.startsWith('...') ? text.substring(3) : text}
                                        </Markdown>
                                    )}


                                    {/* Tool Invocations */}
                                    {message.toolInvocations?.map((tool, toolIdx) => {
                                        // 💎 PREMIUM WIDGET: Lead Capture Form
                                        if (tool.toolName === 'display_lead_form') {
                                            const args = tool.args as any;
                                            return (
                                                <div key={toolIdx} className="mt-4">
                                                    <LeadCaptureForm
                                                        quoteSummary={args?.quote_summary || "Preventivo Ristrutturazione"}
                                                        sessionId={sessionId || "unknown"} // Use prop
                                                    />
                                                </div>
                                            );
                                        }

                                        // 🔒 AUTH WIDGET: Login Request
                                        // Triggered explicitly by 'request_login' OR by the backend AuthGuard signal
                                        const result = tool.result || (tool as any).output;
                                        const isAuthSignal = typeof result === 'string' && result.includes('LOGIN_REQUIRED_UI_TRIGGER');

                                        if (tool.toolName === 'request_login' || isAuthSignal) {
                                            return (
                                                <div key={toolIdx} className="mt-4">
                                                    <LoginRequest />
                                                </div>
                                            );
                                        }

                                        return (
                                            <ToolStatus
                                                key={toolIdx}
                                                tool={tool}
                                                onImageClick={onImageClick}
                                            />
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
});
