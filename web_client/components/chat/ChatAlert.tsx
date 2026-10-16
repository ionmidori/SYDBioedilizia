"use client";

/**
 * ChatAlert - the dismissable banner above the chat input.
 *
 * `error`: the turn failed (assertive `role="alert"`, optional retry action).
 * `warning`: the reply arrives, but something was left out — e.g. an attached
 * video that could not be read (polite `role="status"`).
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ChatAlertAction {
    label: string;
    ariaLabel: string;
    onClick: () => void;
}

interface ChatAlertProps {
    variant: 'error' | 'warning';
    message: string;
    onDismiss: () => void;
    dismissLabel: string;
    action?: ChatAlertAction;
}

const styles = {
    error: {
        box: 'bg-red-900/50 border-red-500/30 text-red-200',
        dot: 'bg-red-500 animate-pulse',
        button: 'bg-red-500/20 hover:bg-red-500/40',
        close: 'hover:bg-red-500/20',
    },
    warning: {
        box: 'bg-amber-900/40 border-amber-500/30 text-amber-100',
        dot: 'bg-amber-400',
        button: 'bg-amber-500/20 hover:bg-amber-500/40',
        close: 'hover:bg-amber-500/20',
    },
} as const;

export function ChatAlert({ variant, message, onDismiss, dismissLabel, action }: ChatAlertProps) {
    const s = styles[variant];
    const live = variant === 'error' ? { role: 'alert' as const } : { role: 'status' as const, 'aria-live': 'polite' as const };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('mx-4 mt-2 p-3 border rounded-lg text-sm flex items-center justify-between gap-2 shadow-lg', s.box)}
        >
            <div className="flex items-center gap-2 min-w-0" {...live}>
                <div className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} />
                <span className="truncate" title={message}>{message}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {action && (
                    <button
                        onClick={action.onClick}
                        className={cn('px-2 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap', s.button)}
                        aria-label={action.ariaLabel}
                    >
                        {action.label}
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    className={cn('p-1 rounded-full transition-colors', s.close)}
                    aria-label={dismissLabel}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </motion.div>
    );
}
