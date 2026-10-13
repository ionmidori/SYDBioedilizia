'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { StatusChip } from '@/components/admin/StatusChip';
import { BATCH_STATUS_CHIP, formatDateTime, formatEuro } from '@/components/admin/quote-status';
import { useAdminBatches } from '@/hooks/admin/use-admin';
import { cn } from '@/lib/utils';

const SCOPES = [
  { id: 'open', label: 'Da lavorare' },
  { id: 'closed', label: 'Conclusi' },
  { id: 'all', label: 'Tutti' },
] as const;

/** Batches the clients sent: who, how many quotes, how far along. Decisions are taken in each quote's dossier. */
export function BatchList() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]['id']>('open');
  const batches = useAdminBatches(scope);

  return (
    <section className="space-y-5" aria-labelledby="batches-title" data-testid="batch-list">
      <div>
        <h1 id="batches-title" className="text-2xl font-semibold">
          Lotti
        </h1>
        <p className="text-sm text-luxury-text/60">
          Più preventivi inviati insieme dallo stesso cliente. Si decide su ciascun preventivo, nel suo dossier.
        </p>
      </div>

      <div role="tablist" aria-label="Filtra i lotti" className="flex gap-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={s.id === scope}
            onClick={() => setScope(s.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap cursor-pointer border',
              s.id === scope ? 'bg-luxury-gold/15 border-luxury-gold/40 text-luxury-gold' : 'border-transparent text-luxury-text/70 hover:bg-white/5',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {batches.isPending ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
        </div>
      ) : batches.isError ? (
        <p role="alert" className="py-10 text-center text-sm text-red-400">
          Impossibile caricare i lotti. Riprova tra poco.
        </p>
      ) : batches.data.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-luxury-text/60" data-testid="batch-empty">
          Nessun lotto in questa sezione.
        </p>
      ) : (
        <ul className="space-y-2">
          {batches.data.items.map((batch) => {
            const chip = BATCH_STATUS_CHIP[batch.status];
            return (
              <li key={batch.batch_id} data-testid="batch-row">
                <Link
                  href={`/admin/batches/${encodeURIComponent(batch.batch_id)}`}
                  className="block rounded-2xl glass-premium border border-white/5 hover:border-luxury-gold/30 transition-colors p-4"
                >
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium" data-testid="batch-client">
                        {batch.client_display_name ?? 'Cliente senza nome'}
                      </p>
                      {batch.client_email && <p className="text-xs text-luxury-text/50 truncate">{batch.client_email}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold tabular-nums">{formatEuro(batch.batch_grand_total)}</p>
                      {batch.potential_savings > 0 && (
                        <p className="text-xs text-emerald-400 tabular-nums">risparmio possibile {formatEuro(batch.potential_savings)}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-luxury-text/50">
                    <StatusChip label={chip.label} className={chip.className} testId="batch-status" />
                    <span data-testid="batch-progress">
                      {batch.decided_projects} di {batch.total_projects} preventivi decisi
                    </span>
                    <span className="ml-auto">Inviato {formatDateTime(batch.submitted_at)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
