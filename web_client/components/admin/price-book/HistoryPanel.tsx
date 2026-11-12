'use client';

import { Loader2 } from 'lucide-react';

import { formatDateTime } from '@/components/admin/quote-status';
import { usePriceBookHistory } from '@/hooks/admin/use-admin';

/** Who changed the prices, when, why and how much (latest 30 versions). */
export function HistoryPanel() {
  const history = usePriceBookHistory(true);
  return (
    <section className="bg-surface shadow-1 rounded-2xl p-4 border border-line" data-testid="pb-history">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-ink mb-3">Storico delle versioni</h2>
      {history.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin text-primary-ink" aria-label="Caricamento" />
      ) : history.isError ? (
        <p role="alert" className="text-sm text-danger-ink">
          Impossibile caricare lo storico.
        </p>
      ) : history.data.items.length === 0 ? (
        <p className="text-sm text-ink-muted">Nessuna modifica salvata: si usa il listino di base.</p>
      ) : (
        <ol className="space-y-2">
          {history.data.items.map((entry) => (
            <li key={entry.version} data-testid="pb-history-item" className="text-sm flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-semibold tabular-nums text-primary-ink">v{entry.version}</span>
              <span className="text-ink-muted">{formatDateTime(entry.created_at)}</span>
              <span className="tabular-nums text-xs text-ink-muted">
                +{entry.added} · ~{entry.changed} · −{entry.removed}
              </span>
              {entry.reason && <span className="basis-full text-ink-muted">{entry.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
