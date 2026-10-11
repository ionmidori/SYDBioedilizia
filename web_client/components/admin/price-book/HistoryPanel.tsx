'use client';

import { Loader2 } from 'lucide-react';

import { formatDateTime } from '@/components/admin/quote-status';
import { usePriceBookHistory } from '@/hooks/admin/use-admin';

/** Who changed the prices, when, why and how much (latest 30 versions). */
export function HistoryPanel() {
  const history = usePriceBookHistory(true);
  return (
    <section className="glass-premium rounded-2xl p-4 border border-white/5" data-testid="pb-history">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-3">Storico delle versioni</h2>
      {history.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin text-luxury-gold" aria-label="Caricamento" />
      ) : history.isError ? (
        <p role="alert" className="text-sm text-red-400">
          Impossibile caricare lo storico.
        </p>
      ) : history.data.items.length === 0 ? (
        <p className="text-sm text-luxury-text/60">Nessuna modifica salvata: si usa il listino di base.</p>
      ) : (
        <ol className="space-y-2">
          {history.data.items.map((entry) => (
            <li key={entry.version} data-testid="pb-history-item" className="text-sm flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-semibold tabular-nums text-luxury-gold">v{entry.version}</span>
              <span className="text-luxury-text/50">{formatDateTime(entry.created_at)}</span>
              <span className="tabular-nums text-xs text-luxury-text/70">
                +{entry.added} · ~{entry.changed} · −{entry.removed}
              </span>
              {entry.reason && <span className="basis-full text-luxury-text/70">{entry.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
