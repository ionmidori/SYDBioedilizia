import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface ActionProps {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    highlight?: boolean;
}

export function QuickActionsRow({ actions }: { actions: ActionProps[] }) {
    return (
        <div data-no-swipe className="w-full overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-3 min-w-max pb-2">
                {actions.map((action, index) => (
                    <ActionPill key={index} {...action} index={index} />
                ))}
            </div>
        </div>
    );
}

function ActionPill({ label, icon: Icon, onClick, highlight, index }: ActionProps & { index: number }) {
    return (
        <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + index * 0.05 }}
            onClick={onClick}
            className={`
                group flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all
                border backdrop-blur-sm whitespace-nowrap
                ${highlight
                    ? 'bg-luxury-gold text-luxury-bg border-luxury-gold hover:bg-luxury-gold/90 hover:scale-105 shadow-lg shadow-luxury-gold/20'
                    : 'bg-luxury-bg/50 text-luxury-text border-luxury-text/10 hover:border-luxury-gold/40 hover:bg-luxury-bg/80'
                }
            `}
        >
            <Icon className={`w-4 h-4 ${highlight ? 'text-luxury-bg' : 'text-luxury-gold'}`} />
            {label}
        </motion.button>
    );
}
