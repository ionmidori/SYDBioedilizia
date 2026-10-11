/**
 * Price book editor logic — pure functions, no I/O.
 *
 * The backend (`PutPriceBookBody`) is the authority: this only mirrors its
 * rules so the admin sees problems before saving, previews what a save changes
 * and can export the list.
 */
import { PRICE_BOOK_MAX_ITEMS, SKU_PATTERN, type PriceBookItem } from '@/types/admin-price-book';

export type ItemErrors = Partial<
  Record<'sku' | 'description' | 'unit' | 'unit_price' | 'category' | 'min_qty' | 'range_min', string>
>;

export interface PriceBookIssues {
  /** Per row index. */
  rows: Map<number, ItemErrors>;
  /** Problems that belong to the whole list. */
  list: string[];
}

export const UNITS = ['mq', 'ml', 'cad', 'ps', 'ore', 'kg', 'mc'] as const;

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validatePriceBook(items: readonly PriceBookItem[]): PriceBookIssues {
  const rows = new Map<number, ItemErrors>();
  const list: string[] = [];
  const add = (index: number, key: keyof ItemErrors, message: string) =>
    rows.set(index, { ...(rows.get(index) ?? {}), [key]: message });

  if (items.length === 0) list.push('Il listino non può essere vuoto.');
  if (items.length > PRICE_BOOK_MAX_ITEMS) list.push(`Massimo ${PRICE_BOOK_MAX_ITEMS} voci.`);

  const firstSeen = new Map<string, number>();
  items.forEach((item, index) => {
    if (!SKU_PATTERN.test(item.sku)) add(index, 'sku', 'Solo lettere, numeri, . _ - (max 40)');
    const key = item.sku.toLowerCase();
    if (firstSeen.has(key)) add(index, 'sku', 'SKU duplicato');
    else firstSeen.set(key, index);
    if (!item.description.trim()) add(index, 'description', 'Descrizione obbligatoria');
    if (!item.unit.trim()) add(index, 'unit', 'Unità obbligatoria');
    if (!item.category.trim()) add(index, 'category', 'Categoria obbligatoria');
    if (!finite(item.unit_price) || item.unit_price < 0) add(index, 'unit_price', 'Prezzo non valido');
    if (finite(item.min_qty) && finite(item.max_qty) && item.min_qty > item.max_qty) {
      add(index, 'min_qty', 'Minimo maggiore del massimo');
    }
    if (finite(item.range_min) && finite(item.range_max) && item.range_min > item.range_max) {
      add(index, 'range_min', 'Range minimo maggiore del massimo');
    }
  });
  return { rows, list };
}

export function hasIssues(issues: PriceBookIssues): boolean {
  return issues.rows.size > 0 || issues.list.length > 0;
}

/** Same key order as the backend dump, so equality is stable. */
function normalise(item: PriceBookItem): string {
  return JSON.stringify({
    ...item,
    tags: item.tags ?? [],
    vat_agevolata: item.vat_agevolata ?? false,
    subcategory: item.subcategory ?? null,
    min_qty: item.min_qty ?? null,
    max_qty: item.max_qty ?? null,
    range_min: item.range_min ?? null,
    range_max: item.range_max ?? null,
  });
}

export function sameItem(a: PriceBookItem, b: PriceBookItem): boolean {
  return normalise(a) === normalise(b);
}

export function itemsEqual(a: readonly PriceBookItem[], b: readonly PriceBookItem[]): boolean {
  return a.length === b.length && a.every((item, index) => sameItem(item, b[index]));
}

export interface DiffCounts {
  added: number;
  removed: number;
  changed: number;
}

/** (added, removed, changed) lines matched by SKU, like the backend's history. */
export function diffCounts(before: readonly PriceBookItem[], after: readonly PriceBookItem[]): DiffCounts {
  const old = new Map(before.map((i) => [i.sku, i]));
  const next = new Map(after.map((i) => [i.sku, i]));
  let added = 0;
  let changed = 0;
  for (const [sku, item] of next) {
    const previous = old.get(sku);
    if (!previous) added += 1;
    else if (!sameItem(previous, item)) changed += 1;
  }
  const removed = [...old.keys()].filter((sku) => !next.has(sku)).length;
  return { added, removed, changed };
}

export function nextSku(items: readonly Pick<PriceBookItem, 'sku'>[]): string {
  const used = new Set(items.map((i) => i.sku.toLowerCase()));
  for (let n = 1; ; n += 1) {
    const sku = `NUOVO-${String(n).padStart(3, '0')}`;
    if (!used.has(sku.toLowerCase())) return sku;
  }
}

export function emptyItem(items: readonly PriceBookItem[]): PriceBookItem {
  return {
    sku: nextSku(items),
    description: '',
    unit: 'mq',
    unit_price: 0,
    category: items[0]?.category ?? '',
    vat_agevolata: false,
    tags: [],
  };
}

export interface Row {
  item: PriceBookItem;
  /** Position in the full list: edits go through it, whatever the filter shows. */
  index: number;
}

function haystack(item: PriceBookItem): string {
  return [item.sku, item.description, item.category, item.subcategory ?? '', ...(item.tags ?? [])]
    .join(' ')
    .toLowerCase();
}

/** Rows matching the category and every word of the search. */
export function filterRows(items: readonly PriceBookItem[], query: string, category: string): Row[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows: Row[] = [];
  items.forEach((item, index) => {
    if (category && item.category !== category) return;
    if (words.length > 0) {
      const text = haystack(item);
      if (!words.every((w) => text.includes(w))) return;
    }
    rows.push({ item, index });
  });
  return rows;
}

export function categoriesOf(items: readonly PriceBookItem[]): string[] {
  return [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value);
  // Quote when needed; neutralise spreadsheet formulas (=, +, -, @ at the start of a text cell).
  const safe = /^[=+@]/.test(text) || (/^-/.test(text) && Number.isNaN(Number(text))) ? `'${text}` : text;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_COLUMNS = [
  'sku',
  'description',
  'unit',
  'unit_price',
  'category',
  'subcategory',
  'vat_agevolata',
  'min_qty',
  'max_qty',
  'range_min',
  'range_max',
  'tags',
] as const;

export function toCsv(items: readonly PriceBookItem[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const item of items) {
    lines.push(
      [
        item.sku,
        item.description,
        item.unit,
        item.unit_price,
        item.category,
        item.subcategory,
        item.vat_agevolata ?? false,
        item.min_qty,
        item.max_qty,
        item.range_min,
        item.range_max,
        (item.tags ?? []).join('|'),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

/** Free text "a, b ,c" → tags (trimmed, no empties, max 20 of 40 chars like the backend). */
export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);
}
