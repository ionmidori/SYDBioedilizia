'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { StatusChip } from '@/components/admin/StatusChip';
import { formatEuro, QUOTE_STATUS_CHIP } from '@/components/admin/quote-status';
import { useAdminDossier } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';

/**
 * Read-only first view of a quote dossier (Phase 5.1): who, what, how much.
 * Photos, line-item editing, approval and sending arrive with Phase 5.2.
 */
export function DossierPreview({ projectId }: { projectId: string }) {
  const dossier = useAdminDossier(projectId);

  if (dossier.isPending) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
      </div>
    );
  }
  if (dossier.isError) {
    const notFound = dossier.error instanceof AdminApiError && dossier.error.status === 404;
    return (
      <div role="alert" className="py-10 text-center space-y-3">
        <p className="text-sm text-red-400">{notFound ? 'Preventivo non trovato.' : 'Impossibile caricare il preventivo.'}</p>
        <Link href="/admin/quotes" className="text-sm text-luxury-gold hover:underline">
          Torna ai preventivi
        </Link>
      </div>
    );
  }

  const { quote, project_name } = dossier.data;
  const client = quote.client_snapshot;
  const status = QUOTE_STATUS_CHIP[quote.status];
  return (
    <article className="space-y-6" data-testid="dossier-preview">
      <Link href="/admin/quotes" className="inline-flex items-center gap-1.5 text-sm text-luxury-text/60 hover:text-luxury-text">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Preventivi
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tabular-nums text-luxury-gold">{quote.quote_number ?? 'Senza numero'}</h1>
        <StatusChip label={status.label} className={status.className} />
        <span className="ml-auto text-xl font-semibold tabular-nums">{formatEuro(quote.financials.grand_total)}</span>
      </header>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="glass-premium rounded-2xl p-4 border border-white/5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-2">Cliente</h2>
          <p className="font-medium">{client?.display_name ?? (client?.is_guest ? 'Cliente ospite' : 'Cliente senza nome')}</p>
          {client?.email && <p className="text-sm text-luxury-text/70">{client.email}</p>}
          {client?.phone && <p className="text-sm text-luxury-text/70">{client.phone}</p>}
        </section>
        <section className="glass-premium rounded-2xl p-4 border border-white/5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-2">Cosa chiede</h2>
          {project_name && <p className="font-medium">{project_name}</p>}
          <p className="text-sm text-luxury-text/70">{quote.request?.summary ?? 'Nessuna descrizione.'}</p>
          {quote.request?.address && <p className="text-sm text-luxury-text/60 mt-1">{quote.request.address}</p>}
        </section>
      </div>
      <p className="text-sm text-luxury-text/50">
        {quote.items.length} voci · foto, modifica delle voci, approvazione e invio arrivano nel prossimo rilascio.
      </p>
    </article>
  );
}
