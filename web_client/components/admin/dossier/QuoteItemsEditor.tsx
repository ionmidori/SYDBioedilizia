'use client';

import { Plus, Search, Trash2 } from 'lucide-react';

import { formatEuro } from '@/components/admin/quote-status';
import { emptyManualItem, isChangedLine, type ItemErrors, lineTotal } from '@/lib/admin/quote-math';
import { cn } from '@/lib/utils';
import type { QuoteItem } from '@/types/quote';

interface Props {
  items: QuoteItem[];
  /** The saved version, to highlight what the admin changed. */
  saved: QuoteItem[];
  errors: Map<number, ItemErrors>;
  readOnly: boolean;
  onChange: (items: QuoteItem[]) => void;
  /** Opens the price book search; when absent the button is not shown. */
  onPickFromPriceBook?: () => void;
}

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50 disabled:opacity-60 disabled:cursor-not-allowed';

/** A number field that can be emptied while typing (NaN = invalid, flagged on save). */
function toNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

export function QuoteItemsEditor({ items, saved, errors, readOnly, onChange, onPickFromPriceBook }: Props) {
  const update = (index: number, patch: Partial<QuoteItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <section className="glass-premium rounded-2xl p-4 border border-white/5 space-y-3" data-testid="items-editor">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold">
          Voci del preventivo <span className="text-luxury-text/40">({items.length})</span>
        </h2>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {onPickFromPriceBook && (
              <button
                type="button"
                onClick={onPickFromPriceBook}
                data-testid="add-from-price-book"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-luxury-gold/15 border border-luxury-gold/30 text-luxury-gold text-sm cursor-pointer"
              >
                <Search className="w-4 h-4" aria-hidden /> Dal listino
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange([...items, emptyManualItem(items)])}
              data-testid="add-item"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm hover:bg-white/5 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden /> Voce manuale
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-luxury-text/60" data-testid="items-empty">
          Nessuna voce. {readOnly ? '' : 'Aggiungine una per poter approvare.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const changed = isChangedLine(item, saved, index);
            const lineErrors = errors.get(index);
            return (
              <li
                key={`${item.sku}-${index}`}
                data-testid="items-row"
                data-changed={changed || undefined}
                className={cn(
                  'rounded-xl border p-3 space-y-2',
                  changed ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10',
                )}
              >
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-start">
                  <label className="col-span-2 md:col-span-5 space-y-1">
                    <span className="text-[11px] text-luxury-text/50">Descrizione</span>
                    <input
                      value={item.description}
                      disabled={readOnly}
                      onChange={(e) => update(index, { description: e.target.value })}
                      aria-invalid={!!lineErrors?.description}
                      data-testid={`item-description-${index}`}
                      className={FIELD}
                    />
                    {lineErrors?.description && <FieldError text={lineErrors.description} />}
                  </label>
                  <label className="space-y-1 md:col-span-1">
                    <span className="text-[11px] text-luxury-text/50">Unità</span>
                    <input
                      value={item.unit}
                      disabled={readOnly}
                      onChange={(e) => update(index, { unit: e.target.value })}
                      aria-invalid={!!lineErrors?.unit}
                      className={FIELD}
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-[11px] text-luxury-text/50">Quantità</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      value={Number.isFinite(item.qty) ? item.qty : ''}
                      disabled={readOnly}
                      onChange={(e) => update(index, { qty: toNumber(e.target.value) })}
                      aria-invalid={!!lineErrors?.qty}
                      data-testid={`item-qty-${index}`}
                      className={cn(FIELD, 'tabular-nums')}
                    />
                    {lineErrors?.qty && <FieldError text={lineErrors.qty} />}
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-[11px] text-luxury-text/50">Prezzo unitario (€)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      value={Number.isFinite(item.unit_price) ? item.unit_price : ''}
                      disabled={readOnly}
                      onChange={(e) => update(index, { unit_price: toNumber(e.target.value) })}
                      aria-invalid={!!lineErrors?.unit_price}
                      data-testid={`item-price-${index}`}
                      className={cn(FIELD, 'tabular-nums')}
                    />
                    {lineErrors?.unit_price && <FieldError text={lineErrors.unit_price} />}
                  </label>
                  <div className="col-span-2 md:col-span-2 flex items-end justify-between md:justify-end gap-2 md:h-full">
                    <div className="text-right">
                      <span className="block text-[11px] text-luxury-text/50">Totale</span>
                      <span className="font-semibold tabular-nums" data-testid={`item-total-${index}`}>
                        {formatEuro(lineTotal(item))}
                      </span>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label={`Rimuovi la voce ${item.description || item.sku}`}
                        onClick={() => onChange(items.filter((_, i) => i !== index))}
                        className="p-2 rounded-lg text-luxury-text/50 hover:text-red-400 hover:bg-red-400/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-luxury-text/50">
                  <span className="tabular-nums">{item.sku}</span>
                  {changed && <span className="text-amber-400">modificata</span>}
                  {!changed && item.manual_override && <span>voce manuale</span>}
                </div>
                {item.ai_reasoning && (
                  <details className="text-xs text-luxury-text/60">
                    <summary className="cursor-pointer">Perché l&apos;AI l&apos;ha proposta</summary>
                    <p className="mt-1">{item.ai_reasoning}</p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <span role="alert" className="block text-[11px] text-red-400">
      {text}
    </span>
  );
}
