import { StatusChip } from '@/components/admin/StatusChip';
import { DELIVERY_STATUS_CHIP, formatDateTime } from '@/components/admin/quote-status';
import type { DeliverySummary } from '@/types/admin-quote';

/** Every send of the PDF, newest first, with the provider's outcome. */
export function DeliveryLog({ deliveries }: { deliveries: DeliverySummary[] }) {
  const ordered = [...deliveries].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  return (
    <section className="bg-surface shadow-1 rounded-2xl p-4 border border-line" data-testid="delivery-log">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-ink mb-3">Invii al cliente</h2>
      {ordered.length === 0 ? (
        <p className="text-sm text-ink-muted">Nessun invio ancora.</p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((delivery) => {
            const chip = DELIVERY_STATUS_CHIP[delivery.status];
            return (
              <li key={delivery.delivery_id} data-testid="delivery-item" className="text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-all">{delivery.to}</span>
                  {chip && <StatusChip label={chip.label} className={chip.className} />}
                </div>
                <div className="text-xs text-ink-muted">
                  Rev. {delivery.revision} · {formatDateTime(delivery.sent_at ?? delivery.created_at)}
                  {delivery.cc.length > 0 && <> · cc {delivery.cc.join(', ')}</>}
                  {delivery.attempts > 1 && <> · {delivery.attempts} tentativi</>}
                </div>
                {delivery.last_error && (
                  <p className="text-xs text-danger-ink" data-testid="delivery-error">
                    {delivery.last_error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
