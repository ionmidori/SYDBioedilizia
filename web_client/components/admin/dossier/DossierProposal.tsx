'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { EstimateRange } from '@/components/admin/dossier/EstimateRange';
import { formatDateTime, formatEuro } from '@/components/admin/quote-status';
import { Button } from '@/components/ui/button';
import { computeTotals } from '@/lib/admin/quote-math';
import type { QuoteProposal } from '@/types/admin-quote';
import type { QuoteItem, QuoteRoom } from '@/types/quote';

interface Props {
  proposal: QuoteProposal | null | undefined;
  /** The version on screen: a proposal made on another one is outdated. */
  quoteVersion: number;
  quoteRooms: QuoteRoom[];
  quoteItems: QuoteItem[];
  /** The quote's VAT rate: the apply keeps it, so the total shown uses it. */
  vatRate: number;
  canApply: boolean;
  /** Why the apply button is disabled (shown as its tooltip). */
  disabledReason?: string;
  pending: boolean;
  /** Called with the proposal's `created_at`: the server refuses it if the chat replaced it since. */
  onApply: (proposalCreatedAt: string) => void;
}

/** The lines of each room, as a comparable key (sku + qty, order-free). */
function linesByRoom(items: QuoteItem[]): Map<string, string> {
  const rooms = new Map<string, string[]>();
  for (const item of items) {
    const room = item.room_id ?? '';
    rooms.set(room, [...(rooms.get(room) ?? []), `${item.sku}×${item.qty}`]);
  }
  return new Map([...rooms].map(([room, lines]) => [room, lines.sort().join('|')]));
}

/**
 * AI revision proposal (relay plan): a change the client asked in the chat while
 * the team had the quote, analysed like a first quote but never written on it.
 * "Applica alla bozza" replaces the draft's lines with the proposal's (after a
 * confirmation); hidden without a proposal or once applied.
 */
export function DossierProposal({
  proposal,
  quoteVersion,
  quoteRooms,
  quoteItems,
  vatRate,
  canApply,
  disabledReason,
  pending,
  onApply,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  if (!proposal || proposal.applied_at) return null;

  const outdated = proposal.based_on_version !== quoteVersion;
  const known = new Set(quoteRooms.map((room) => room.room_id));
  const added = proposal.rooms.filter((room) => !known.has(room.room_id));
  const current = linesByRoom(quoteItems);
  const proposed = linesByRoom(proposal.items);
  const changed = proposal.rooms.filter(
    (room) => known.has(room.room_id) && current.get(room.room_id) !== proposed.get(room.room_id),
  );
  // The apply replaces the sections: a room of the quote missing here loses its section.
  const kept = new Set(proposal.rooms.map((room) => room.room_id));
  const removed = quoteRooms.filter((room) => !kept.has(room.room_id));
  const total = computeTotals(proposal.items, vatRate).grandTotal;

  return (
    <section
      className="bg-surface shadow-1 rounded-2xl p-4 border border-line space-y-3"
      aria-labelledby="proposal-title"
      data-testid="dossier-proposal"
    >
      <h2 id="proposal-title" className="flex items-center gap-2 text-sm font-semibold text-primary-ink">
        <Sparkles className="w-4 h-4" aria-hidden />
        Proposta AI di revisione del {formatDateTime(proposal.created_at)}
      </h2>
      {proposal.summary && <p className="text-sm text-ink">{proposal.summary}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Voci</dt>
        <dd className="tabular-nums">{proposal.items.length}</dd>
        <dt className="text-ink-muted">Totale IVA inclusa</dt>
        <dd className="font-semibold tabular-nums" data-testid="proposal-total">
          {formatEuro(total)}
        </dd>
        {added.length > 0 && (
          <>
            <dt className="text-ink-muted">Stanze nuove</dt>
            <dd data-testid="proposal-rooms-added">{added.map((room) => room.room_label).join(', ')}</dd>
          </>
        )}
        {changed.length > 0 && (
          <>
            <dt className="text-ink-muted">Stanze modificate</dt>
            <dd data-testid="proposal-rooms-changed">{changed.map((room) => room.room_label).join(', ')}</dd>
          </>
        )}
        {removed.length > 0 && (
          <>
            <dt className="text-ink-muted">Stanze tolte</dt>
            <dd data-testid="proposal-rooms-removed">{removed.map((room) => room.room_label).join(', ')}</dd>
          </>
        )}
      </dl>
      <EstimateRange estimate={proposal.estimate} />

      {outdated ? (
        <p className="text-xs text-ink-muted" data-testid="proposal-outdated">
          Proposta fatta sulla revisione {proposal.based_on_version}: il preventivo è cambiato dopo, non si può più
          applicare.
        </p>
      ) : confirming ? (
        <div className="space-y-2" role="group" aria-label="Conferma applicazione proposta">
          <p className="text-sm text-ink">
            Le voci e le stanze della bozza vengono sostituite da quelle della proposta (nuova revisione). IVA e note
            restano come sono.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !canApply}
              onClick={() => {
                setConfirming(false);
                onApply(proposal.created_at);
              }}
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" aria-hidden />}
              Conferma
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !canApply}
          title={canApply ? undefined : disabledReason}
          onClick={() => setConfirming(true)}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" aria-hidden />}
          Applica alla bozza
        </Button>
      )}
    </section>
  );
}
