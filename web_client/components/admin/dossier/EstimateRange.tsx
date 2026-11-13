import { formatEuro } from '@/components/admin/quote-status';
import type { PriceEstimate } from '@/types/quote';

/**
 * The price range the code computed from the sources of the measures (Phase 140, step 3), VAT included.
 * For the team only: the client gets the precision, never the range. Nothing without a range.
 */
export function EstimateRange({ estimate }: { estimate: PriceEstimate | null | undefined }) {
  if (estimate?.low === undefined || estimate.high === undefined) return null;
  const { low, high, precision, policy_version: policy } = estimate;

  return (
    <p data-testid="estimate-range" className="text-xs text-ink-muted">
      <span className="font-semibold text-ink">Forbice</span>{' '}
      <span className="tabular-nums">
        {formatEuro(low)} – {formatEuro(high)}
      </span>{' '}
      (IVA inclusa)
      {typeof precision === 'number' && <> · precisione {precision} %</>}
      {policy && <> · policy {policy}</>}
    </p>
  );
}
