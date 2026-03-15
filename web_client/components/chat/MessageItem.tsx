"use client";

import React, { useMemo } from 'react';
import { motion, Variants } from 'framer-motion';
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
import { useAuth } from '@/hooks/useAuth';
import { MessageFeedback } from '@/components/chat/MessageFeedback';
import Link from 'next/link';
import Image from 'next/image';

import { Message, ReasoningStep, ToolInvocation } from '@/types/chat';

interface MessageItemProps {
    message: Message;
    typingMessage?: string;
    sessionId?: string; // made optional
    onImageClick: (imageUrl: string) => void;
    onFormSubmit?: (data: unknown) => void;
}

/**
 * Single message item component
 * Handles rendering of one chat message with its avatar, content, and attachments
 * ✅ Memoized to prevent unnecessary re-renders
 */
export const MessageItem = React.memo<MessageItemProps>(({ message, typingMessage, sessionId, onImageClick, onFormSubmit }) => {
    const { user } = useAuth();

    // Helper: Extract text from both old (content) and new (parts[]) formats
    const getMessageText = (msg: Message): string => {
        if (msg.parts && Array.isArray(msg.parts)) {
            return (msg.parts as { type: string; text?: string }[])
                .filter((part) => part.type === 'text' && typeof part.text === 'string')
                .map((part) => part.text as string)
                .join('');
        }
        if (typeof msg.content === 'string') return msg.content;
        return JSON.stringify(msg.content || '');
    };

    // Helper: Extract tool invocations from both formats
    const getToolInvocations = (msg: Message): ToolInvocation[] => {
        if (msg.toolInvocations && msg.toolInvocations.length > 0) {
            return msg.toolInvocations;
        }
        if (msg.parts && Array.isArray(msg.parts)) {
            return (msg.parts as { type: string; toolInvocation?: ToolInvocation }[])
                .filter((part) => part.type === 'tool-invocation' && part.toolInvocation)
                .map((part) => part.toolInvocation as ToolInvocation);
        }
        return [];
    };

    // Fix for React 18/19 type mismatch
    const Markdown = ReactMarkdown as React.ComponentType<React.ComponentProps<typeof ReactMarkdown>>;

    const text = getMessageText(message);
    const toolInvocations = getToolInvocations(message);
    const hasTools = toolInvocations.length > 0;

    // Helper: Convert custom backend image syntax to Markdown
    const formatMessageText = (rawText: string): string => {
        if (!rawText) return '';
        // Regex to match [Immagine allegata: URL] and convert to ![Immagine allegata](URL)
        return rawText.replace(
            /\[(?:Immagine|Video) allegat[oa]:\s*(https?:\/\/[^\]]+)\]/gi,
            (match, url) => `\n![Immagine allegata](${url})\n`
        );
    };

    const formattedText = formatMessageText(text);

    // ✅ Memoize ReactMarkdown components to prevent re-creation on every render
    const markdownComponents = useMemo(() => ({
        img: ({ ...props }: { src?: string; alt?: string }) => props.src ? (
            <ImagePreview
                src={String(props.src)}
                alt={String(props.alt || 'Generated image')}
                onClick={onImageClick}
            />
        ) : null
    }), [onImageClick]);

    const variants: Variants = {
        hidden: { opacity: 0, y: 15, scale: 0.98 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                duration: 0.45,
                ease: [0.23, 1, 0.32, 1] // Skill: animating-ui-interactions Custom Luxury Ease
            }
        },
        exit: {
            opacity: 0,
            scale: 0.95,
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
    const hasVisibleTools = toolInvocations.some(tool => {
        if (tool.toolName === 'display_lead_form') return true; // Always visible
        if (tool.toolName === 'request_login') return true; // 🔥 Login Widget Always visible

        // 🧠 Thinking State: Only visible while "calling" (thinking). 
        // Once done, it disappears (state='result' returns false), preventing empty bubble.
        if (tool.toolName === 'processing_request') {
            return tool.state === 'call';
        }

        if (tool.state === 'call') return true; // Loading of other tools is always visible

        const result = (tool.result || (tool as { output?: unknown }).output) as { imageUrl?: string; error?: string; status?: string } | string | null | undefined;

        // 🔥 GLOBAL AUTH INTERCEPT:
        // If ANY tool returns the specific Auth Signal or is the explicit 'request_login' tool, 
        // we must show the bubble to render the LoginRequest widget.
        if (tool.toolName === 'request_login') return true;
        if (typeof result === 'string' && result.includes('LOGIN_REQUIRED_UI_TRIGGER')) return true;

        // Only results with images/gallery or errors are visible in ToolStatus
        // Text results (like pricing) return null in ToolStatus, so we hide the bubble to avoid empty padding.
        if (tool.toolName === 'show_project_gallery') return true;
        
        let parsedResult: unknown = result;
        if (typeof result === 'string') {
            try {
                parsedResult = JSON.parse(result);
            } catch {
                // Ignore parse errors, treat as string
            }
        }

        if (parsedResult && typeof parsedResult === 'object') {
            const typed = parsedResult as Record<string, unknown>;
            return !!typed.imageUrl || !!typed.error || typed.status === 'error';
        }
        return false;
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
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
                "flex gap-3 max-w-[90%] group/msg",
                message.role === 'user' ? "ml-auto flex-row-reverse" : "items-start"
            )}
        >
            {/* Avatar */}
            {message.role === 'user' ? (
                <Link
                    href="/dashboard/profile"
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border mt-1 transition-all hover:scale-110 active:scale-95 group overflow-hidden relative"
                    title="Impostazioni Profilo"
                >
                    {user?.photoURL ? (
                        <Image
                            src={user.photoURL}
                            alt={user.displayName || "User"}
                            fill
                            sizes="32px"
                            priority
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-luxury-teal border-luxury-teal text-white shadow-sm">
                            <User className="w-4 h-4" />
                        </div>
                    )}
                </Link>
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
                {message.role === 'user' && (() => {
                    // AI SDK v6: images live in message.parts as FileUIPart (type: 'file')
                    // Fallback: legacy message.attachments.images (Firestore history)
                    const filePartUrls = (message.parts as { type: string; url?: string; mediaType?: string }[] | undefined)
                        ?.filter((p) => p.type === 'file' && typeof p.url === 'string' && p.mediaType?.startsWith('image/'))
                        .map((p) => p.url as string) ?? [];
                    const imageUrls = filePartUrls.length > 0
                        ? filePartUrls
                        : (message.attachments?.images ?? []);
                    if (imageUrls.length === 0) return null;
                    return (
                        <div className="flex flex-wrap gap-2 justify-end">
                            {imageUrls.map((imageUrl, imgIdx) => (
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
                    );
                })()}

                {/* 2. Main Text Bubble */}
                {shouldShow && (
                    <div className={cn(
                        "p-4 text-sm leading-relaxed shadow-lg backdrop-blur-xl transition-all duration-300", // Increased blur and transition
                        message.role === 'user'
                            ? "bg-luxury-teal text-white rounded-[24px_24px_4px_24px] border border-transparent shadow-luxury-teal/20" // Organic shape USER
                            : "bg-luxury-bg/85 backdrop-blur-2xl border border-luxury-gold/10 text-luxury-text rounded-[24px_24px_24px_4px] shadow-lg shadow-black/5" // Organic shape AI + Stronger Glass
                    )}>
                        <div className="prose prose-sm prose-invert prose-p:my-1 prose-pre:bg-slate-900 prose-pre:p-2 prose-pre:rounded-lg prose-pre:overflow-x-auto max-w-none break-words [word-break:break-word] overflow-hidden w-full">
                            {isThinking ? (
                                <ThinkingIndicator message={typingMessage} />
                            ) : (
                                <>
                                    {formattedText && !hasVisibleTools && (
                                        <Markdown
                                            urlTransform={(value: string) => value}
                                            components={markdownComponents}
                                        >
                                            {/* Strip leading "..." if present (artifact of Zero-Latency Hack) */}
                                            {formattedText.startsWith('...') ? formattedText.substring(3) : formattedText}
                                        </Markdown>
                                    )}

                                    {/* Special Case: Allow text IF it's NOT a Login Request (to preserve context for other tools) */}
                                    {formattedText && hasVisibleTools && !toolInvocations.some(t => t.toolName === 'request_login' || (t.result as string)?.includes?.('LOGIN_REQUIRED_UI_TRIGGER')) && (
                                        <Markdown
                                            urlTransform={(value: string) => value}
                                            components={markdownComponents}
                                        >
                                            {formattedText}
                                        </Markdown>
                                    )}


                                    {/* Tool Invocations */}
                                    {toolInvocations.map((tool, toolIdx) => {
                                        // 💎 PREMIUM WIDGET: Lead Capture Form
                                        if (tool.toolName === 'display_lead_form') {
                                            const args = tool.args as { quote_summary?: string };
                                            return (
                                                <div key={toolIdx} className="mt-4">
                                                    <LeadCaptureForm
                                                        description={args?.quote_summary || "Per generare il render, ho bisogno di questi dati."}
                                                        onSubmit={(data) => {
                                                            console.log("📝 Form Submitted:", data);
                                                            if (onFormSubmit) onFormSubmit(data);
                                                        }}
                                                    />
                                                </div>
                                            );
                                        }

                                        // 🔒 AUTH WIDGET: Login Request
                                        // Triggered explicitly by 'request_login' OR by the backend AuthGuard signal
                                        const result = tool.result || (tool as { output?: unknown }).output;
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

                {/* Feedback: thumbs up/down on assistant messages (self-correction loop) */}
                {message.role === 'assistant' && !isThinking && text && sessionId && (
                    <MessageFeedback messageId={message.id} sessionId={sessionId} />
                )}
            </div>
        </motion.div>
    );
});

MessageItem.displayName = 'MessageItem';
