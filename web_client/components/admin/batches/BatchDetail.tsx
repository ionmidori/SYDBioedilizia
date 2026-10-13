'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { StatusChip } from '@/components/admin/StatusChip';
import {
  BATCH_STATUS_CHIP,
  DELIVERY_STATUS_CHIP,
  formatDateTime,
  formatEuro,
  QUOTE_STATUS_CHIP,
} from '@/components/admin/quote-status';
import { useAdminBatch } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';

const ADJUSTMENT_LABEL: Record<string, string> = {
  dedup_singleton: 'Voci uniche accorpate',
  merge_quantities: 'Quantità unite',
  volume_discount: 'Sconto sui volumi',
  shared_overhead: 'Costi comuni condivisi',
};

function describeAdjustment(entry: Record<string, unknown>): { title: string; savings: number | null } {
  const type = typeof entry.adjustment_type === 'string' ? entry.adjustment_type : '';
  const description = typeof entry.description === 'string' ? entry.description : '';
  return {
    title: description || ADJUSTMENT_LABEL[type] || 'Ottimizzazione',
    savings: typeof entry.savings === 'number' ? entry.savings : null,
  };
}

/** One batch: totals, the optimisation preview and the live state of each quote, each leading to its dossier. */
export function BatchDetail({ batchId }: { batchId: string }) {
  const batch = useAdminBatch(batchId);

  if (batch.isPending) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
      </div>
    );
  }
  if (batch.isError) {
    const notFound = batch.error instanceof AdminApiError && batch.error.status === 404;
    return (
      <div role="alert" className="py-10 text-center space-y-3">
        <p className="text-sm text-red-400">{notFound ? 'Lotto non trovato.' : 'Impossibile caricare il lotto.'}</p>
        <Link href="/admin/batches" className="text-sm text-luxury-gold hover:underline">
          Torna ai lotti
        </Link>
      </div>
    );
  }

  const data = batch.data;
  const chip = BATCH_STATUS_CHIP[data.status];
  const optimised = Math.max(0, data.batch_grand_total - data.potential_savings);
  return (
    <article className="space-y-5" data-testid="batch-detail">
      <Link href="/admin/batches" className="inline-flex items-center gap-1.5 text-sm text-luxury-text/60 hover:text-luxury-text">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Lotti
      </Link>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold" data-testid="batch-title">
          {data.client_display_name ?? 'Cliente senza nome'}
        </h1>
        <StatusChip label={chip.label} className={chip.className} testId="batch-detail-status" />
        {data.client_email && <span className="text-sm text-luxury-text/50">{data.client_email}</span>}
        <span className="ml-auto text-sm text-luxury-text/50">Inviato {formatDateTime(data.submitted_at)}</span>
      </header>

      <dl className="grid grid-cols-3 gap-3 text-center" data-testid="batch-totals">
        {(
          [
            ['Totale originale', data.batch_grand_total],
            ['Risparmio possibile', data.potential_savings],
            ['Totale ottimizzato', optimised],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="glass-premium rounded-2xl p-4 border border-white/5 flex flex-col-reverse">
            <dt className="text-xs text-luxury-text/60">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatEuro(value)}</dd>
          </div>
        ))}
      </dl>

      {data.aggregation_preview.length > 0 && (
        <section className="glass-premium rounded-2xl p-4 border border-white/5" data-testid="batch-optimisation">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-2">Ottimizzazioni tra i progetti</h2>
          <ul className="space-y-1 text-sm">
            {data.aggregation_preview.map((entry, index) => {
              const { title, savings } = describeAdjustment(entry);
              return (
                <li key={index} className="flex justify-between gap-3">
                  <span>{title}</span>
                  {savings != null && <span className="tabular-nums text-emerald-400">−{formatEuro(savings)}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="batch-projects" className="space-y-2">
        <h2 id="batch-projects" className="text-xs font-semibold uppercase tracking-wide text-luxury-gold">
          Preventivi del lotto
        </h2>
        <p className="text-sm text-luxury-text/60">
          Apri il dossier per vedere foto e voci, approvare o rifiutare e inviare l&apos;email: lo stato del lotto si aggiorna da solo.
        </p>
        <ul className="space-y-2">
          {data.projects.map((project) => {
            const status = project.quote_status ? QUOTE_STATUS_CHIP[project.quote_status] : null;
            const delivery = DELIVERY_STATUS_CHIP[project.delivery_status];
            return (
              <li key={project.project_id} data-testid="batch-project">
                <Link
                  href={`/admin/quotes/${encodeURIComponent(project.project_id)}`}
                  className="block rounded-2xl glass-premium border border-white/5 hover:border-luxury-gold/30 transition-colors p-4"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold tabular-nums text-luxury-gold">{project.quote_number ?? 'Senza numero'}</span>
                    <span className="font-medium">{project.project_name}</span>
                    <span className="ml-auto tabular-nums font-semibold">{formatEuro(project.grand_total)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-luxury-text/50">
                    {status ? (
                      <StatusChip label={status.label} className={status.className} testId="batch-project-status" />
                    ) : (
                      <span data-testid="batch-project-missing">Preventivo non trovato</span>
                    )}
                    {delivery && <StatusChip label={delivery.label} className={delivery.className} />}
                    <span>{project.item_count} voci</span>
                    {project.admin_notes && <span className="basis-full text-luxury-text/70">Nota: {project.admin_notes}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
