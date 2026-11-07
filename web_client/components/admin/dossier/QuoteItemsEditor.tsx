'use client';

import type { ReactNode } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';

import { formatEuro } from '@/components/admin/quote-status';
import {
  emptyManualItem,
  groupByRoom,
  isChangedLine,
  type ItemErrors,
  lineTotal,
  type RoomGroup,
} from '@/lib/admin/quote-math';
import { cn } from '@/lib/utils';
import { GENERAL_ROOM_ID, type QuoteItem, type QuoteRoom } from '@/types/quote';

interface Props {
  items: QuoteItem[];
  /** The saved version, to highlight what the admin changed. */
  saved: QuoteItem[];
  errors: Map<number, ItemErrors>;
  readOnly: boolean;
  onChange: (items: QuoteItem[]) => void;
  /** Opens the price book search; when absent the button is not shown. */
  onPickFromPriceBook?: () => void;
  /** Sections of a multi-room quote: lines are shown and added room by room. */
  rooms?: QuoteRoom[];
}

const FIELD =
  'w-full rounded-lg bg-surface border border-line px-2.5 py-1.5 text-base md:text-sm focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed';

const NO_ROOMS: QuoteRoom[] = [];

/** A number field that can be emptied while typing (NaN = invalid, flagged on save). */
function toNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

export function QuoteItemsEditor({
  items,
  saved,
  errors,
  readOnly,
  onChange,
  onPickFromPriceBook,
  rooms = NO_ROOMS,
}: Props) {
  const update = (index: number, patch: Partial<QuoteItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const addManual = (roomId?: string) => onChange([...items, emptyManualItem(items, roomId)]);

  const groups = groupByRoom(items, rooms);
  const sections = groups.map((group) => group.room);

  const row = (index: number) => (
    <ItemRow
      key={`${items[index].sku}-${index}`}
      item={items[index]}
      index={index}
      changed={isChangedLine(items[index], saved, index)}
      lineErrors={errors.get(index)}
      readOnly={readOnly}
      sections={sections}
      onUpdate={(patch) => update(index, patch)}
      onRemove={() => remove(index)}
    />
  );

  return (
    <section className="glass-premium rounded-2xl p-4 border border-line space-y-3" data-testid="items-editor">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
          Voci del preventivo <span className="text-ink-subtle">({items.length})</span>
        </h2>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {onPickFromPriceBook && (
              <button
                type="button"
                onClick={onPickFromPriceBook}
                data-testid="add-from-price-book"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-subtle border border-line text-accent-ink text-sm cursor-pointer"
              >
                <Search className="w-4 h-4" aria-hidden /> Dal listino
              </button>
            )}
            {groups.length === 0 && (
              <button
                type="button"
                onClick={() => addManual()}
                data-testid="add-item"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm hover:bg-surface cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden /> Voce manuale
              </button>
            )}
          </div>
        )}
      </div>

      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <RoomSection key={group.room.room_id} group={group} readOnly={readOnly} onAdd={() => addManual(group.room.room_id)}>
              {group.indices.map(row)}
            </RoomSection>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted" data-testid="items-empty">
          Nessuna voce. {readOnly ? '' : 'Aggiungine una per poter approvare.'}
        </p>
      ) : (
        <ul className="space-y-2">{items.map((_, index) => row(index))}</ul>
      )}
    </section>
  );
}

function RoomSection({
  group,
  readOnly,
  onAdd,
  children,
}: {
  group: RoomGroup;
  readOnly: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  const { room, indices, subtotal } = group;
  return (
    <section className="space-y-2" data-testid="room-section" aria-label={`Stanza ${room.room_label}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1.5">
        <h3 className="text-sm font-semibold">
          {room.room_label} <span className="text-ink-subtle font-normal">({indices.length})</span>
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums" data-testid={`room-subtotal-${room.room_id}`}>
            Subtotale <span className="font-semibold">{formatEuro(subtotal)}</span>
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={onAdd}
              data-testid={`add-item-${room.room_id}`}
              aria-label={`Aggiungi una voce manuale a ${room.room_label}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-line text-xs hover:bg-surface cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Voce
            </button>
          )}
        </div>
      </div>
      {indices.length === 0 ? (
        <p className="py-2 text-xs text-ink-muted">Nessuna voce in questa stanza.</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function ItemRow({
  item,
  index,
  changed,
  lineErrors,
  readOnly,
  sections,
  onUpdate,
  onRemove,
}: {
  item: QuoteItem;
  index: number;
  changed: boolean;
  lineErrors: ItemErrors | undefined;
  readOnly: boolean;
  /** Rooms the line can be moved to (empty: a quote without rooms). */
  sections: QuoteRoom[];
  onUpdate: (patch: Partial<QuoteItem>) => void;
  onRemove: () => void;
}) {
  return (
    <li
      data-testid="items-row"
      data-changed={changed || undefined}
      className={cn('rounded-xl border p-3 space-y-2', changed ? 'border-warning/40 bg-warning-subtle' : 'border-line')}
    >
      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-start">
        <label className="col-span-2 md:col-span-5 space-y-1">
          <span className="text-[11px] text-ink-muted">Descrizione</span>
          <input
            value={item.description}
            disabled={readOnly}
            onChange={(e) => onUpdate({ description: e.target.value })}
            aria-invalid={!!lineErrors?.description}
            data-testid={`item-description-${index}`}
            className={FIELD}
          />
          {lineErrors?.description && <FieldError text={lineErrors.description} />}
        </label>
        <label className="space-y-1 md:col-span-1">
          <span className="text-[11px] text-ink-muted">Unità</span>
          <input
            value={item.unit}
            disabled={readOnly}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            aria-invalid={!!lineErrors?.unit}
            className={FIELD}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] text-ink-muted">Quantità</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={Number.isFinite(item.qty) ? item.qty : ''}
            disabled={readOnly}
            onChange={(e) => onUpdate({ qty: toNumber(e.target.value) })}
            aria-invalid={!!lineErrors?.qty}
            data-testid={`item-qty-${index}`}
            className={cn(FIELD, 'tabular-nums')}
          />
          {lineErrors?.qty && <FieldError text={lineErrors.qty} />}
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[11px] text-ink-muted">Prezzo unitario (€)</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={Number.isFinite(item.unit_price) ? item.unit_price : ''}
            disabled={readOnly}
            onChange={(e) => onUpdate({ unit_price: toNumber(e.target.value) })}
            aria-invalid={!!lineErrors?.unit_price}
            data-testid={`item-price-${index}`}
            className={cn(FIELD, 'tabular-nums')}
          />
          {lineErrors?.unit_price && <FieldError text={lineErrors.unit_price} />}
        </label>
        <div className="col-span-2 md:col-span-2 flex items-end justify-between md:justify-end gap-2 md:h-full">
          <div className="text-right">
            <span className="block text-[11px] text-ink-muted">Totale</span>
            <span className="font-semibold tabular-nums" data-testid={`item-total-${index}`}>
              {formatEuro(lineTotal(item))}
            </span>
          </div>
          {!readOnly && (
            <button
              type="button"
              aria-label={`Rimuovi la voce ${item.description || item.sku}`}
              onClick={onRemove}
              className="p-2 rounded-lg text-ink-muted hover:text-danger-ink hover:bg-danger-subtle cursor-pointer"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        <span className="tabular-nums">{item.sku}</span>
        {changed && <span className="text-warning-ink">modificata</span>}
        {!changed && item.manual_override && <span>voce manuale</span>}
        {sections.length > 1 && !readOnly && (
          <label className="ml-auto inline-flex items-center gap-1.5">
            <span>Stanza</span>
            <select
              value={item.room_id && sections.some((s) => s.room_id === item.room_id) ? item.room_id : GENERAL_ROOM_ID}
              onChange={(e) => onUpdate({ room_id: e.target.value })}
              data-testid={`item-room-${index}`}
              className="rounded-md bg-surface border border-line px-1.5 py-0.5 text-base md:text-xs text-ink cursor-pointer"
            >
              {sections.map((s) => (
                <option key={s.room_id} value={s.room_id}>
                  {s.room_label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {item.ai_reasoning && (
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer">Perché l&apos;AI l&apos;ha proposta</summary>
          <p className="mt-1">{item.ai_reasoning}</p>
        </details>
      )}
    </li>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <span role="alert" className="block text-[11px] text-danger-ink">
      {text}
    </span>
  );
}
