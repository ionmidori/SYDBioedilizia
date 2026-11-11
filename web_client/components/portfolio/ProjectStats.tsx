import { visibleStats, type PortfolioItem } from '@/lib/portfolio';

/**
 * The stats row of a card. Which stats appear is configured in
 * `PORTFOLIO_VISIBLE_STATS` (lib/portfolio/config.ts), not here.
 */
export function ProjectStats({ stats }: { stats: PortfolioItem['stats'] }) {
    const items = visibleStats(stats);
    if (items.length === 0) return null;

    return (
        <dl className="flex gap-4 border-t border-line pt-3">
            {items.map(({ key, label, value }) => (
                <div key={key} className="block">
                    <dt className="block text-xs text-accent-ink uppercase tracking-wider">{label}</dt>
                    <dd className="block text-sm text-ink font-medium tabular-nums">{value || '—'}</dd>
                </div>
            ))}
        </dl>
    );
}
