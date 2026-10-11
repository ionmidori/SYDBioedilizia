'use client';

import { ChevronDown, Trash2 } from 'lucide-react';

import { type ItemErrors, parseTags, UNITS } from '@/lib/admin/price-book-logic';
import { cn } from '@/lib/utils';
import type { PriceBookItem } from '@/types/admin-price-book';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50';

type Mark = 'new' | 'changed' | null;

interface Props {
  index: number;
  item: PriceBookItem;
  errors: ItemErrors | undefined;
  mark: Mark;
  open: boolean;
  categoryListId: string;
  onChange: (patch: Partial<PriceBookItem>) => void;
  onToggle: () => void;
  onRemove: () => void;
}

/** NaN while a number field is empty: flagged by validation, never silently 0. */
function num(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

function optionalNum(raw: string): number | null {
  return raw.trim() === '' ? null : Number(raw);
}

export function PriceBookRow({
  index,
  item,
  errors,
  mark,
  open,
  categoryListId,
  onChange,
  onToggle,
  onRemove,
}: Props) {
  const units = (UNITS as readonly string[]).includes(item.unit) ? UNITS : [...UNITS, item.unit];
  return (
    <li
      data-testid="pb-row"
      data-mark={mark ?? undefined}
      className={cn(
        'rounded-xl border p-3 space-y-2',
        mark ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10',
      )}
    >
      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-start">
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] text-luxury-text/50">SKU</span>
          <input
            value={item.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            aria-invalid={!!errors?.sku}
            data-testid={`pb-sku-${index}`}
            className={cn(FIELD, 'tabular-nums')}
          />
          {errors?.sku && <Error text={errors.sku} />}
        </label>
        <label className="col-span-2 md:col-span-4 space-y-1">
          <span className="text-[11px] text-luxury-text/50">Descrizione</span>
          <input
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            aria-invalid={!!errors?.description}
            data-testid={`pb-description-${index}`}
            className={FIELD}
          />
          {errors?.description && <Error text={errors.description} />}
        </label>
        <label className="space-y-1 md:col-span-1">
          <span className="text-[11px] text-luxury-text/50">Unità</span>
          <select
            value={item.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            data-testid={`pb-unit-${index}`}
            className={FIELD}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] text-luxury-text/50">Prezzo (€)</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={Number.isFinite(item.unit_price) ? item.unit_price : ''}
            onChange={(e) => onChange({ unit_price: num(e.target.value) })}
            aria-invalid={!!errors?.unit_price}
            data-testid={`pb-price-${index}`}
            className={cn(FIELD, 'tabular-nums')}
          />
          {errors?.unit_price && <Error text={errors.unit_price} />}
        </label>
        <label className="col-span-2 md:col-span-2 space-y-1">
          <span className="text-[11px] text-luxury-text/50">Categoria</span>
          <input
            value={item.category}
            list={categoryListId}
            onChange={(e) => onChange({ category: e.target.value })}
            aria-invalid={!!errors?.category}
            data-testid={`pb-category-${index}`}
            className={FIELD}
          />
          {errors?.category && <Error text={errors.category} />}
        </label>
        <div className="col-span-2 md:col-span-1 flex items-end justify-end gap-1 md:h-full">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`Dettagli della voce ${item.sku}`}
            className="p-2 rounded-lg text-luxury-text/50 hover:text-luxury-text hover:bg-white/5 cursor-pointer"
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Elimina la voce ${item.sku}`}
            className="p-2 rounded-lg text-luxury-text/50 hover:text-red-400 hover:bg-red-400/10 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>

      {mark && (
        <p className="text-[11px] text-amber-400" data-testid="pb-mark">
          {mark === 'new' ? 'nuova voce' : 'modificata'}
        </p>
      )}

      {open && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 border-t border-white/10 pt-2" data-testid="pb-details">
          <label className="col-span-2 space-y-1">
            <span className="text-[11px] text-luxury-text/50">Sottocategoria</span>
            <input
              value={item.subcategory ?? ''}
              onChange={(e) => onChange({ subcategory: e.target.value || null })}
              className={FIELD}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-luxury-text/50">Quantità min</span>
            <input
              type="number"
              step="any"
              min={0}
              value={item.min_qty ?? ''}
              onChange={(e) => onChange({ min_qty: optionalNum(e.target.value) })}
              aria-invalid={!!errors?.min_qty}
              className={cn(FIELD, 'tabular-nums')}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-luxury-text/50">Quantità max</span>
            <input
              type="number"
              step="any"
              min={0}
              value={item.max_qty ?? ''}
              onChange={(e) => onChange({ max_qty: optionalNum(e.target.value) })}
              className={cn(FIELD, 'tabular-nums')}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-luxury-text/50">Range min (€)</span>
            <input
              type="number"
              step="any"
              min={0}
              value={item.range_min ?? ''}
              onChange={(e) => onChange({ range_min: optionalNum(e.target.value) })}
              aria-invalid={!!errors?.range_min}
              className={cn(FIELD, 'tabular-nums')}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-luxury-text/50">Range max (€)</span>
            <input
              type="number"
              step="any"
              min={0}
              value={item.range_max ?? ''}
              onChange={(e) => onChange({ range_max: optionalNum(e.target.value) })}
              className={cn(FIELD, 'tabular-nums')}
            />
          </label>
          <label className="col-span-2 md:col-span-5 space-y-1">
            <span className="text-[11px] text-luxury-text/50">Parole chiave (separate da virgola)</span>
            <input
              // Uncontrolled (committed on blur); the key re-syncs it when tags change from outside.
              key={(item.tags ?? []).join('|')}
              defaultValue={(item.tags ?? []).join(', ')}
              onBlur={(e) => onChange({ tags: parseTags(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:pt-5">
            <input
              type="checkbox"
              checked={item.vat_agevolata ?? false}
              onChange={(e) => onChange({ vat_agevolata: e.target.checked })}
            />
            IVA agevolata
          </label>
          {(errors?.min_qty || errors?.range_min) && (
            <p role="alert" className="col-span-full text-[11px] text-red-400">
              {errors.min_qty ?? errors.range_min}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Error({ text }: { text: string }) {
  return (
    <span role="alert" className="block text-[11px] text-red-400">
      {text}
    </span>
  );
}
