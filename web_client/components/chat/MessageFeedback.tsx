"use client";

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { triggerHaptic } from '@/lib/haptics';
import type { FeedbackRequest } from '@/types/feedback';

interface MessageFeedbackProps {
    messageId: string;
    sessionId: string;
    initialRating?: -1 | 0 | 1;
}

/**
 * Thumbs up/down feedback on assistant messages.
 * Sends rating to POST /api/feedback → Python backend → Firestore.
 * Part of the self-correction loop (evaluating-adk-agents skill).
 * Optimized for Mobile: visible on touch devices, hover-only on desktop.
 */
export const MessageFeedback = React.memo<MessageFeedbackProps>(({ messageId, sessionId, initialRating = 0 }) => {
    const { refreshToken } = useAuth();
    const [rating, setRating] = useState<-1 | 0 | 1>(initialRating);
    const [submitting, setSubmitting] = useState(false);

    // Sync state if initialRating changes (e.g. via real-time update)
    React.useEffect(() => {
        setRating(initialRating);
    }, [initialRating]);

    const submit = useCallback(async (value: -1 | 1) => {
        // Toggle: clicking same button resets to neutral
        const newRating = rating === value ? 0 : value;
        setRating(newRating);
        
        // Haptic feedback for interaction
        triggerHaptic();

        if (newRating === 0) return; // Reset doesn't need API call

        setSubmitting(true);
        try {
            // Ensure we have a fresh token (handles race conditions with guest auth)
            const token = await refreshToken();
            
            const payload: FeedbackRequest = {
                session_id: sessionId,
                message_id: messageId,
                rating: newRating,
            };

            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(payload),
            });
            
            if (!res.ok) {
                console.error('[MessageFeedback] Failed to submit feedback:', res.status, await res.text());
                // Revert UI optimism on failure
                setRating(rating);
            }
        } catch (err) {
            console.error('[MessageFeedback] Network error:', err);
            // Revert UI optimism on failure
            setRating(rating);
        } finally {
            setSubmitting(false);
        }
    }, [rating, messageId, sessionId, refreshToken]);

    return (
        <div className={cn(
            "flex items-center gap-1 mt-1 transition-opacity duration-300",
            // Mobile: Always visible (since hover is not available)
            // Desktop (md+): Visible only on message hover
            "opacity-100 md:opacity-0 md:group-hover/msg:opacity-100"
        )}>
            <button
                onClick={() => submit(1)}
                disabled={submitting}
                aria-label="Utile"
                className={cn(
                    "p-1.5 rounded-full transition-all duration-200 hover:bg-luxury-gold/10",
                    "min-h-[32px] min-w-[32px] flex items-center justify-center", // Enhanced tap target for mobile
                    rating === 1
                        ? "text-emerald-500 scale-110"
                        : "text-luxury-text/30 hover:text-luxury-text/60"
                )}
            >
                <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={() => submit(-1)}
                disabled={submitting}
                aria-label="Non utile"
                className={cn(
                    "p-1.5 rounded-full transition-all duration-200 hover:bg-luxury-gold/10",
                    "min-h-[32px] min-w-[32px] flex items-center justify-center", // Enhanced tap target for mobile
                    rating === -1
                        ? "text-red-400 scale-110"
                        : "text-luxury-text/30 hover:text-luxury-text/60"
                )}
            >
                <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
                {rating !== 0 && (
                    <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        className="text-[10px] text-luxury-text/40 ml-1"
                    >
                        {rating === 1 ? 'Grazie!' : 'Ci miglioreremo'}
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    );
});

MessageFeedback.displayName = 'MessageFeedback';
