import { MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyProjectsStateProps {
    onOpenChat: () => void;
}

/** Nothing in the house yet: it starts with the first message (Phase 139: one chat per user). */
export function EmptyProjectsState({ onOpenChat }: EmptyProjectsStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-luxury-gold/30 rounded-2xl bg-luxury-gold/5"
        >
            <div className="w-16 h-16 rounded-full bg-luxury-gold/20 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-luxury-gold" />
            </div>
            <h3 className="text-xl font-serif font-bold text-luxury-text mb-2">
                La tua casa è ancora vuota
            </h3>
            <p className="text-luxury-text/60 max-w-sm mb-6">
                Racconta in chat cosa vuoi ristrutturare. L&apos;IA ti guiderà passo dopo passo.
            </p>
            <button
                onClick={onOpenChat}
                className="px-6 py-2 bg-luxury-gold text-luxury-bg font-bold rounded-lg hover:bg-luxury-gold/90 transition-colors shadow-lg shadow-luxury-gold/20 flex items-center gap-2"
            >
                <MessageSquare className="w-5 h-5" />
                Scrivi in chat
            </button>
        </motion.div>
    );
}
