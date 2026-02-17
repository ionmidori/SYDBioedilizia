import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { M3Spring } from '@/lib/m3-motion';

interface ActionProps {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    highlight?: boolean;
}

export function QuickActionsRow({ actions }: { actions: ActionProps[] }) {
    return (
        <div data-no-swipe className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {actions.map((action, index) => (
                <ActionCard
                    key={index}
                    {...action}
                    index={index}
                    span={action.highlight}
                />
            ))}
        </div>
    );
}

// Backward compatibility alias
export const QuickActionsGrid = QuickActionsRow;

function ActionCard({ label, icon: Icon, onClick, highlight, index, span }: ActionProps & { index: number; span?: boolean }) {
    return (
        <motion.button
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.08, ...M3Spring.standard }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`
                group flex items-center gap-3 rounded-[16px] text-left transition-all cursor-pointer
                ${span ? 'sm:col-span-2 lg:col-span-1 p-4' : 'p-3'}
                ${highlight
                    ? 'bg-luxury-gold/10 border border-luxury-gold/30 hover:bg-luxury-gold/15 hover:border-luxury-gold/50 hover:shadow-elevation-high'
                    : 'surface-container-low hover:surface-container-high hover:shadow-elevation-high'
                }
            `}
        >
            <div className={`
                p-2.5 rounded-xl transition-colors duration-200
                ${highlight
                    ? 'bg-luxury-gold/20 text-luxury-gold'
                    : 'bg-white/5 text-luxury-gold/70 group-hover:bg-luxury-gold/10 group-hover:text-luxury-gold'
                }
            `}>
                <Icon className={highlight ? 'w-5 h-5' : 'w-4 h-4'} />
            </div>
            <div>
                <span className={`
                    font-medium block
                    ${highlight ? 'text-luxury-gold text-sm' : 'text-luxury-text text-[13px]'}
                `}>
                    {label}
                </span>
                {highlight && (
                    <span className="text-[10px] text-luxury-gold/60 mt-0.5 block">
                        Crea un nuovo cantiere
                    </span>
                )}
            </div>
        </motion.button>
    );
}
