/**
 * Line-item arithmetic for the admin editor.
 *
 * The backend is the authority (`normalise_items` + `PricingService`): it
 * recomputes every total and flags `manual_override`. This mirror exists only
 * so the admin sees the effect of an edit before saving. Both sides use the
 * same money rule (`lib/money.ts` here, `src/core/money.py` there, pinned by
 * `contracts/money/golden_vectors.json`), so the preview shows the cents the
 * saved quote and its PDF will have.
 */
import * as money from '@/lib/money';
import type { QuoteItem } from '@/types/quote';

export interface Totals {
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
}

/** A half-typed field (NaN) counts as zero, so the preview never shows NaN. */
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

const lineCents = (item: Pick<QuoteItem, 'qty' | 'unit_price'>): money.Cents =>
  money.lineTotal(finite(item.qty), finite(item.unit_price));

export function lineTotal(item: Pick<QuoteItem, 'qty' | 'unit_price'>): number {
  return money.centsToNumber(lineCents(item));
}

export function computeTotals(items: readonly Pick<QuoteItem, 'qty' | 'unit_price'>[], vatRate: number): Totals {
  const totals = money.computeTotals(items.map(lineCents), finite(vatRate));
  return {
    subtotal: money.centsToNumber(totals.subtotal),
    vatAmount: money.centsToNumber(totals.vatAmount),
    grandTotal: money.centsToNumber(totals.grandTotal),
  };
}

/** Fields the admin can change (the rest of a line is carried over untouched). */
const EDITABLE: ReadonlyArray<keyof QuoteItem> = ['sku', 'description', 'unit', 'qty', 'unit_price'];

export function isSameItem(a: QuoteItem, b: QuoteItem): boolean {
  return EDITABLE.every((key) => a[key] === b[key]);
}

export function itemsEqual(a: readonly QuoteItem[], b: readonly QuoteItem[]): boolean {
  return a.length === b.length && a.every((item, index) => isSameItem(item, b[index]));
}

/** A line the admin added or changed compared with the saved version. */
export function isChangedLine(draft: QuoteItem, saved: readonly QuoteItem[], index: number): boolean {
  const original = saved[index];
  return !original || !isSameItem(draft, original);
}

export type ItemErrors = Partial<Record<'description' | 'unit' | 'qty' | 'unit_price', string>>;

/** Per-line validation; the key is the line index. Empty map = valid. */
export function validateItems(items: readonly QuoteItem[]): Map<number, ItemErrors> {
  const errors = new Map<number, ItemErrors>();
  items.forEach((item, index) => {
    const found: ItemErrors = {};
    if (!item.description.trim()) found.description = 'Descrizione obbligatoria';
    if (!item.unit.trim()) found.unit = 'Unità obbligatoria';
    if (!Number.isFinite(item.qty) || item.qty < 0) found.qty = 'Quantità non valida';
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) found.unit_price = 'Prezzo non valido';
    if (Object.keys(found).length > 0) errors.set(index, found);
  });
  return errors;
}

/** SKU for a line typed by hand: `MANUALE-001`, never colliding with the current ones. */
export function nextManualSku(items: readonly Pick<QuoteItem, 'sku'>[]): string {
  const used = new Set(items.map((item) => item.sku));
  for (let n = 1; ; n += 1) {
    const sku = `MANUALE-${String(n).padStart(3, '0')}`;
    if (!used.has(sku)) return sku;
  }
}

export function emptyManualItem(items: readonly Pick<QuoteItem, 'sku'>[]): QuoteItem {
  return {
    sku: nextManualSku(items),
    description: '',
    unit: 'cad',
    qty: 1,
    unit_price: 0,
    total: 0,
    manual_override: true,
  };
}
