import { visibleStats, type PortfolioItem } from '@/lib/portfolio';

/**
 * The stats row of a card. Which stats appear is configured in
 * `PORTFOLIO_VISIBLE_STATS` (lib/portfolio/config.ts), not here.
 *
 * `inline` renders spans only, for cards that are themselves a <button> (a
 * description list is not valid phrasing content); otherwise a <dl>.
 */
export function ProjectStats({
    stats,
    inline = false,
}: {
    stats: PortfolioItem['stats'];
    inline?: boolean;
}) {
    const items = visibleStats(stats);
    if (items.length === 0) return null;

    const Root = inline ? 'span' : 'dl';
    const Item = inline ? 'span' : 'div';
    const Term = inline ? 'span' : 'dt';
    const Value = inline ? 'span' : 'dd';

    return (
        <Root className="flex gap-4 border-t border-luxury-text/10 pt-3">
            {items.map(({ key, label, value }) => (
                <Item key={key} className="block">
                    <Term className="block text-[10px] text-luxury-gold/80 uppercase tracking-wider">{label}</Term>
                    <Value className="block text-xs text-luxury-text font-medium">{value || '—'}</Value>
                </Item>
            ))}
        </Root>
    );
}
