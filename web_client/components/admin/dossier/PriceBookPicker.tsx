'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';

import { formatEuro } from '@/components/admin/quote-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePriceBook } from '@/hooks/admin/use-admin';
import { filterRows } from '@/lib/admin/price-book-logic';
import type { PriceBookItem } from '@/types/admin-price-book';
import type { QuoteItem } from '@/types/quote';

const MAX_RESULTS = 30;

/** A quote line from a price book entry: quantity 1, the list price. */
export function quoteItemFromPriceBook(entry: PriceBookItem): QuoteItem {
  return {
    sku: entry.sku,
    description: entry.description,
    unit: entry.unit,
    qty: entry.min_qty && entry.min_qty > 1 ? entry.min_qty : 1,
    unit_price: entry.unit_price,
    total: 0, // the server recomputes every total
    category: entry.category,
    manual_override: true,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: QuoteItem) => void;
}

/** Search the price book and add a line with the official SKU and price. */
export function PriceBookPicker({ open, onOpenChange, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-luxury-bg border-luxury-gold/20 text-luxury-text">
        <DialogHeader>
          <DialogTitle>Aggiungi dal listino</DialogTitle>
          <DialogDescription>Cerca per SKU, descrizione, categoria o parola chiave.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: loads the price book when needed and starts with an empty search. */}
        {open && <PickerBody onPick={(item) => { onPick(item); onOpenChange(false); }} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onPick }: { onPick: (item: QuoteItem) => void }) {
  const book = usePriceBook();
  const [query, setQuery] = useState('');
  const results = useMemo(
    () => (book.data ? filterRows(book.data.items, query, '').slice(0, MAX_RESULTS) : []),
    [book.data, query],
  );

  if (book.isPending) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
      </div>
    );
  }
  if (book.isError) {
    return (
      <p role="alert" className="py-6 text-center text-sm text-red-400">
        Impossibile caricare il listino.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-luxury-text/40" aria-hidden />
        <label htmlFor="picker-search" className="sr-only">
          Cerca nel listino
        </label>
        <input
          id="picker-search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Es. piastrelle bagno, DEM-001…"
          data-testid="picker-search"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50"
        />
      </div>
      {results.length === 0 ? (
        <p className="py-6 text-center text-sm text-luxury-text/60" data-testid="picker-empty">
          Nessuna voce trovata.
        </p>
      ) : (
        <ul className="divide-y divide-white/5" data-testid="picker-results">
          {results.map(({ item }) => (
            <li key={item.sku} className="flex items-center gap-3 py-2" data-testid="picker-row">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.description}</p>
                <p className="text-xs text-luxury-text/60">
                  <span className="tabular-nums">{item.sku}</span> · {item.category}
                </p>
              </div>
              <span className="tabular-nums text-sm whitespace-nowrap">
                {formatEuro(item.unit_price)} / {item.unit}
              </span>
              <button
                type="button"
                onClick={() => onPick(quoteItemFromPriceBook(item))}
                aria-label={`Aggiungi ${item.sku}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-luxury-gold/15 border border-luxury-gold/30 text-luxury-gold text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden /> Aggiungi
              </button>
            </li>
          ))}
        </ul>
      )}
      {book.data.items.length > 0 && (
        <p className="text-xs text-luxury-text/50">
          {results.length >= MAX_RESULTS ? `Primi ${MAX_RESULTS} risultati: affina la ricerca. ` : ''}
          {book.data.items.length} voci nel listino.
        </p>
      )}
    </div>
  );
}
