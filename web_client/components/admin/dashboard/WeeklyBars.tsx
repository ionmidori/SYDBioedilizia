import type { WeeklyApprovals } from '@/types/admin-content';

const WIDTH = 480;
const HEIGHT = 160;
const PAD = { top: 12, right: 8, bottom: 26, left: 24 };

function label(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

/**
 * Approvals per week as light SVG bars (no chart library). The numbers are also
 * in a visually hidden table, so the chart is not the only way to read them.
 */
export function WeeklyBars({ weeks }: { weeks: WeeklyApprovals[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.approvals));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, weeks.length);
  const barW = Math.min(36, slot * 0.6);
  const total = weeks.reduce((sum, w) => sum + w.approvals, 0);

  return (
    <figure data-testid="weekly-bars">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Approvazioni delle ultime ${weeks.length} settimane: ${total} in totale`}
        className="w-full h-auto"
      >
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="currentColor" opacity={0.15} />
        <text x={PAD.left - 6} y={PAD.top + 8} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}>
          {max}
        </text>
        <text x={PAD.left - 6} y={PAD.top + plotH} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}>
          0
        </text>
        {weeks.map((week, i) => {
          const h = (week.approvals / max) * plotH;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          return (
            <g key={week.week_start}>
              <rect
                x={x}
                y={PAD.top + plotH - h}
                width={barW}
                height={h}
                rx={3}
                fill="var(--color-luxury-gold, #C9A84C)"
                opacity={week.approvals > 0 ? 1 : 0.2}
              />
              {week.approvals > 0 && (
                <text x={x + barW / 2} y={PAD.top + plotH - h - 4} textAnchor="middle" fontSize={10} fill="currentColor">
                  {week.approvals}
                </text>
              )}
              <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.55}>
                {label(week.week_start)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Approvazioni per settimana (dal lunedì indicato)</caption>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week_start}>
              <th scope="row">{w.week_start}</th>
              <td>{w.approvals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
