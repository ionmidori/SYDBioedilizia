'use client';

import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

import { formatDateTime, formatEuro } from '@/components/admin/quote-status';
import { useAdminRevision } from '@/hooks/admin/use-admin';
import { cn } from '@/lib/utils';
import type { RevisionSummary } from '@/types/admin-quote';
import type { QuoteRoom, RevisionChange } from '@/types/quote';

const ACTOR_LABEL: Record<string, string> = {
  ai: 'Proposta AI',
  admin: 'Modifica admin',
  system: 'Sistema',
};

const CHANGE_LABEL: Record<RevisionChange['change'], { text: string; className: string }> = {
  added: { text: 'Aggiunta', className: 'text-emerald-400' },
  removed: { text: 'Rimossa', className: 'text-red-400' },
  changed: { text: 'Modificata', className: 'text-amber-400' },
};

/** Newest first. Each revision is immutable; its diff loads when opened. */
export function RevisionTimeline({
  projectId,
  revisions,
  approvedRevision,
  rooms = [],
}: {
  projectId: string;
  revisions: RevisionSummary[];
  approvedRevision?: number | null;
  /** Sections of a multi-room quote: each change shows the room of its line. */
  rooms?: QuoteRoom[];
}) {
  const roomLabels = new Map(rooms.map((room) => [room.room_id, room.room_label]));
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const ordered = [...revisions].sort((a, b) => b.version - a.version);

  return (
    <section className="glass-premium rounded-2xl p-4 border border-white/5" data-testid="revision-timeline">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-3">Revisioni</h2>
      {ordered.length === 0 ? (
        <p className="text-sm text-luxury-text/60">Nessuna revisione registrata.</p>
      ) : (
        <ol className="space-y-1.5">
          {ordered.map((revision) => {
            const open = openVersion === revision.version;
            return (
              <li key={revision.version} data-testid="revision-item">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenVersion(open ? null : revision.version)}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/5 cursor-pointer"
                >
                  <span className="font-semibold tabular-nums text-luxury-gold">Rev. {revision.version}</span>
                  <span className="text-luxury-text/70">{ACTOR_LABEL[revision.actor_kind] ?? revision.actor_kind}</span>
                  {approvedRevision === revision.version && (
                    <span className="text-[11px] text-emerald-400 border border-emerald-400/30 rounded-full px-2">approvata</span>
                  )}
                  <span className="ml-auto text-xs text-luxury-text/50">{formatDateTime(revision.created_at)}</span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} aria-hidden />
                </button>
                {open && <RevisionDetail projectId={projectId} revision={revision} roomLabels={roomLabels} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function RevisionDetail({
  projectId,
  revision,
  roomLabels,
}: {
  projectId: string;
  revision: RevisionSummary;
  roomLabels: Map<string, string>;
}) {
  const detail = useAdminRevision(projectId, revision.version, true);

  return (
    <div className="mx-2.5 mb-2 mt-1 space-y-2 border-l border-white/10 pl-3 text-sm" data-testid="revision-detail">
      {revision.reason && <p className="text-luxury-text/70">Motivo: {revision.reason}</p>}
      {revision.grand_total != null && (
        <p className="text-luxury-text/70">
          Totale IVA inclusa: <span className="tabular-nums font-medium">{formatEuro(revision.grand_total)}</span>
        </p>
      )}
      {detail.isPending && <Loader2 className="w-4 h-4 animate-spin text-luxury-gold" aria-label="Caricamento" />}
      {detail.isError && (
        <p role="alert" className="text-red-400">
          Impossibile caricare il dettaglio.
        </p>
      )}
      {detail.data &&
        (detail.data.diff.length === 0 ? (
          <p className="text-luxury-text/60">Nessuna differenza nelle voci rispetto alla revisione precedente.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.data.diff.map((change, index) => (
              <li key={`${change.room_id ?? ''}-${change.sku}-${index}`} data-testid="diff-row">
                <span className={cn('font-medium', CHANGE_LABEL[change.change].className)}>
                  {CHANGE_LABEL[change.change].text}
                </span>{' '}
                {change.room_id && (
                  <span className="text-luxury-text/50">[{roomLabels.get(change.room_id) ?? change.room_id}] </span>
                )}
                <span>{describe(change.after ?? change.before)}</span>
                {change.change === 'changed' && change.before && (
                  <span className="block text-xs text-luxury-text/50">prima: {describe(change.before)}</span>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function describe(summary: Record<string, unknown> | null | undefined): string {
  if (!summary) return '';
  const qty = typeof summary.qty === 'number' ? summary.qty : null;
  const price = typeof summary.unit_price === 'number' ? summary.unit_price : null;
  const unit = typeof summary.unit === 'string' ? summary.unit : '';
  const parts = [String(summary.description ?? '')];
  if (qty !== null && price !== null) parts.push(`${qty} ${unit} × ${formatEuro(price)}`);
  return parts.filter(Boolean).join(' — ');
}
