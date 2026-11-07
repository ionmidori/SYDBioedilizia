'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ImageIcon, Loader2, Lock, MessageSquare, Search, X } from 'lucide-react';

import { StatusChip } from '@/components/admin/StatusChip';
import {
  DELIVERY_STATUS_CHIP,
  formatDateTime,
  formatEuro,
  INBOX_FILTERS,
  type InboxFilterId,
  QUOTE_STATUS_CHIP,
} from '@/components/admin/quote-status';
import { useAdminQuotes } from '@/hooks/admin/use-admin';
import { cn } from '@/lib/utils';
import type { AdminQuoteListItem } from '@/types/admin-quote';

/**
 * Admin inbox: who asked, for what, how much, in which state.
 * Search is an exact token match on the backend (quote number, a word of the
 * client name, or the email), so it is applied on submit, not per keystroke.
 */
export function QuoteInbox() {
  const [filterId, setFilterId] = useState<InboxFilterId>('open');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');

  const filters = useMemo(() => {
    const status = INBOX_FILTERS.find((f) => f.id === filterId)?.status;
    return { status, q: query || undefined };
  }, [filterId, query]);
  const quotes = useAdminQuotes(filters);
  const rows = quotes.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="space-y-5" aria-labelledby="inbox-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="inbox-title" className="text-2xl font-semibold">
            Preventivi
          </h1>
          <p className="text-sm text-ink-muted">Richieste dei clienti da revisionare, approvare e inviare.</p>
        </div>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(draft.trim());
          }}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <label htmlFor="inbox-search" className="sr-only">
            Cerca per numero, nome o email
          </label>
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <input
              id="inbox-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="PRV-2026-0042, Rossi o email"
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface border border-line text-base md:text-sm focus:outline-none focus:border-accent"
            />
            {query && (
              <button
                type="button"
                aria-label="Cancella ricerca"
                onClick={() => {
                  setDraft('');
                  setQuery('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-accent-subtle border border-line text-accent-ink text-sm cursor-pointer"
          >
            Cerca
          </button>
        </form>
      </div>

      <div role="tablist" aria-label="Filtra per stato" className="flex gap-1 overflow-x-auto pb-1">
        {INBOX_FILTERS.map((filter) => (
          <button
            key={filter.id}
            role="tab"
            type="button"
            aria-selected={filter.id === filterId}
            onClick={() => setFilterId(filter.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap cursor-pointer border',
              filter.id === filterId
                ? 'bg-accent-subtle border-accent text-accent-ink'
                : 'border-transparent text-ink-muted hover:bg-surface',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {quotes.isPending ? (
        <div className="py-16 flex justify-center" data-testid="inbox-loading">
          <Loader2 className="w-6 h-6 animate-spin text-accent-ink" aria-label="Caricamento" />
        </div>
      ) : quotes.isError ? (
        <p role="alert" className="py-10 text-center text-sm text-danger-ink">
          Impossibile caricare i preventivi. Riprova tra poco.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted" data-testid="inbox-empty">
          {query ? `Nessun preventivo trovato per «${query}».` : 'Nessun preventivo in questa sezione.'}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="inbox-list">
          {rows.map((row) => (
            <InboxRow key={row.project_id} row={row} />
          ))}
        </ul>
      )}

      {quotes.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void quotes.fetchNextPage()}
            disabled={quotes.isFetchingNextPage}
            className="px-4 py-2 rounded-xl border border-line text-sm hover:bg-surface disabled:opacity-50 cursor-pointer"
          >
            {quotes.isFetchingNextPage ? 'Caricamento…' : 'Carica altri'}
          </button>
        </div>
      )}
    </section>
  );
}

function InboxRow({ row }: { row: AdminQuoteListItem }) {
  const status = QUOTE_STATUS_CHIP[row.status];
  const delivery = DELIVERY_STATUS_CHIP[row.delivery_status];
  const client = row.client_display_name || (row.client_is_guest ? 'Cliente ospite' : 'Cliente senza nome');

  return (
    <li data-testid="inbox-row">
      <Link
        href={`/admin/quotes/${encodeURIComponent(row.project_id)}`}
        className="block rounded-2xl glass-premium border border-line hover:border-line transition-colors p-4"
      >
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold tabular-nums text-accent-ink" data-testid="inbox-number">
                {row.quote_number ?? 'Senza numero'}
              </span>
              <span className="text-ink-subtle">·</span>
              <span className="font-medium truncate" data-testid="inbox-client">
                {client}
              </span>
              {row.client_email && <span className="text-xs text-ink-muted truncate">{row.client_email}</span>}
            </div>
            {row.summary && <p className="mt-1 text-sm text-ink-muted line-clamp-2">{row.summary}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="font-semibold tabular-nums">{formatEuro(row.grand_total)}</div>
            <div className="text-xs text-ink-muted">{row.item_count} voci</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <StatusChip label={status.label} className={status.className} testId="inbox-status" />
          {delivery && <StatusChip label={delivery.label} className={delivery.className} />}
          {row.channel === 'chat' && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" aria-hidden /> da chat
            </span>
          )}
          {row.thumbnail_media_id && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" aria-hidden /> con foto
            </span>
          )}
          {row.locked_by && (
            <span className="inline-flex items-center gap-1 text-info-ink">
              <Lock className="w-3.5 h-3.5" aria-hidden /> in revisione da un admin
            </span>
          )}
          <span className="ml-auto">Aggiornato {formatDateTime(row.updated_at)}</span>
        </div>
      </Link>
    </li>
  );
}
