import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface StatProps {
    label: string;
    value: string | number;
    icon?: LucideIcon;
    isLoading?: boolean;
}

export function StatsGrid({ stats, isLoading }: { stats: StatProps[], isLoading: boolean }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            {stats.map((stat, index) => (
                <StatCard key={index} {...stat} isLoading={isLoading} index={index} />
            ))}
        </div>
    );
}

function StatCard({ label, value, icon: Icon, isLoading, index }: StatProps & { index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="group relative flex flex-col items-center justify-center aspect-square p-4 rounded-3xl bg-luxury-bg/80 border border-luxury-gold/15 hover:border-luxury-gold/30 transition-all duration-300 backdrop-blur-sm shadow-sm"
        >
            {/* Background Hover Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-luxury-gold/0 to-luxury-gold/0 group-hover:from-luxury-gold/5 group-hover:to-transparent rounded-3xl transition-all duration-500" />

            {/* Icon */}
            {Icon && (
                <div className="relative mb-2">
                    <Icon className="w-5 h-5 text-luxury-gold/50 group-hover:text-luxury-gold transition-colors" />
                </div>
            )}

            {/* Value */}
            <div className="relative">
                {isLoading ? (
                    <div className="h-10 w-16 bg-luxury-text/10 rounded animate-pulse" />
                ) : (
                    <span className="text-4xl md:text-5xl font-serif font-bold text-luxury-gold drop-shadow-[0_0_8px_rgba(233,196,106,0.15)] tracking-tight">
                        {value}
                    </span>
                )}
            </div>

            {/* Label */}
            <div className="relative mt-2 text-center">
                <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider font-sans text-luxury-text/70">
                    {label}
                </span>
            </div>
        </motion.div>
    );
}
