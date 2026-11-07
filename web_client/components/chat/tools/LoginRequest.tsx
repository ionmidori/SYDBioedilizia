'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, LogIn } from 'lucide-react';
import { useChatContext } from '@/hooks/useChatContext';

/**
 * LoginRequest — M3 Expressive auth gate widget.
 *
 * Rendered inside a chat bubble when the ADK agent calls `request_login`.
 * Captures the last user message and forwards it as `pendingMessage` so
 * GlobalAuthListener can re-send it automatically after successful auth.
 */
export const LoginRequest = () => {
    const { messages } = useChatContext();

    // Find the last user message — this is what triggered the login gate.
    const pendingMessage = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role !== 'user') continue;
            // AI SDK v7: UIMessage.parts is fully typed — no `as any` needed.
            const parts = (msg.parts ?? []) as { type: string; text?: string }[];
            const textPart = parts.find(p => p.type === 'text');
            if (textPart?.text) return textPart.text;
        }
        return '';
    }, [messages]);

    const triggerLogin = () => {
        window.dispatchEvent(
            new CustomEvent('OPEN_LOGIN_MODAL', {
                bubbles: true,
                composed: true,
                detail: {
                    pendingMessage,           // re-sent automatically after login
                },
            })
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="my-3 w-72 overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl backdrop-blur-2xl"
        >
            {/* Top accent stripe */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

            <div className="px-5 py-4">
                {/* Header row */}
                <div className="mb-3 flex items-center gap-3">
                    <motion.div
                        animate={{ scale: [1, 1.12, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-subtle ring-1 ring-inset ring-ring"
                    >
                        <Sparkles className="h-4 w-4 text-accent-ink" />
                    </motion.div>
                    <span className="text-xs font-semibold uppercase tracking-widest text-accent-ink">
                        Funzione Premium
                    </span>
                </div>

                {/* Body */}
                <p className="mb-4 text-sm leading-relaxed text-ink-muted">
                    Il rendering e il preventivo richiedono un account gratuito.
                    <br />
                    Accedi in pochi secondi — procediamo subito dopo.
                </p>

                {/* CTA */}
                <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={triggerLogin}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-2.5 text-sm font-bold text-on-accent shadow-md transition-colors hover:bg-accent active:bg-accent/80"
                >
                    <LogIn className="h-4 w-4" />
                    Accedi o Registrati
                </motion.button>
            </div>

            {/* Bottom accent stripe */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </motion.div>
    );
};
