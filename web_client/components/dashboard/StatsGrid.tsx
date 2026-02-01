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
            className="group relative flex flex-col justify-between p-4 rounded-3xl bg-luxury-bg/50 border border-luxury-text/5 hover:border-luxury-gold/20 transition-all duration-300 backdrop-blur-sm"
        >
            {/* Background Hover Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-luxury-gold/0 to-luxury-gold/0 group-hover:from-luxury-gold/5 group-hover:to-transparent rounded-3xl transition-all duration-500" />

            {/* Top: Value */}
            <div className="relative">
                {isLoading ? (
                    <div className="h-8 w-16 bg-luxury-text/10 rounded animate-pulse" />
                ) : (
                    <span className="text-3xl md:text-4xl font-serif font-bold text-luxury-gold tracking-tight">
                        {value}
                    </span>
                )}
            </div>

            {/* Bottom: Label & Icon */}
            <div className="relative mt-2 flex items-center justify-between text-luxury-text/60">
                <span className="text-xs md:text-sm font-medium uppercase tracking-wider font-sans">
                    {label}
                </span>
                {Icon && (
                    <Icon className="w-4 h-4 text-luxury-text/40 group-hover:text-luxury-gold transition-colors" />
                )}
            </div>
        </motion.div>
    );
}
