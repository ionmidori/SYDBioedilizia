import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyProjectsStateProps {
    onCreate: () => void;
}

export function EmptyProjectsState({ onCreate }: EmptyProjectsStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-luxury-gold/30 rounded-2xl bg-luxury-gold/5"
        >
            <div className="w-16 h-16 rounded-full bg-luxury-gold/20 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-luxury-gold" />
            </div>
            <h3 className="text-xl font-serif font-bold text-luxury-text mb-2">
                Nessun progetto attivo
            </h3>
            <p className="text-luxury-text/60 max-w-sm mb-6">
                Inizia la tua ristrutturazione creando il tuo primo progetto. L'IA ti guiderà passo dopo passo.
            </p>
            <button
                onClick={onCreate}
                className="px-6 py-2 bg-luxury-gold text-luxury-bg font-bold rounded-lg hover:bg-luxury-gold/90 transition-colors shadow-lg shadow-luxury-gold/20 flex items-center gap-2"
            >
                <Plus className="w-5 h-5" />
                Crea Progetto
            </button>
        </motion.div>
    );
}
