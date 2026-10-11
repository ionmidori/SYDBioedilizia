'use client';

import { useId, useMemo, useState } from 'react';
import { CheckCircle2, Download, History, Loader2, Plus, Save, Search } from 'lucide-react';

import { HistoryPanel } from '@/components/admin/price-book/HistoryPanel';
import { PriceBookRow } from '@/components/admin/price-book/PriceBookRow';
import { SaveDialog } from '@/components/admin/price-book/SaveDialog';
import { usePriceBook, useSavePriceBook } from '@/hooks/admin/use-admin';
import {
  categoriesOf,
  diffCounts,
  emptyItem,
  filterRows,
  hasIssues,
  itemsEqual,
  toCsv,
  validatePriceBook,
} from '@/lib/admin/price-book-logic';
import type { PriceBookItem } from '@/types/admin-price-book';

const PAGE_SIZE = 40;

/**
 * Unsaved edits, tied to the version they started from. `savedAs` is the ETag
 * the server returned for them: the draft stays on screen until the refetched
 * price book carries it, so a save never flashes the old prices.
 */
interface Draft {
  baseEtag: string;
  savedAs: string | null;
  items: PriceBookItem[];
}

/**
 * The price list the AI quotes with. Every save is versioned (If-Match) and
 * recorded with who/when/why; prices reach new quotes within a minute.
 */
export function PriceBookEditor() {
  const book = usePriceBook();
  const save = useSavePriceBook();
  const categoryListId = useId();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const saved = useMemo(() => book.data?.items ?? [], [book.data]);
  const etag = book.data?.etag ?? '';
  const activeDraft = draft && draft.savedAs && draft.savedAs === etag ? null : draft;
  const awaitingRefresh = !!activeDraft?.savedAs && book.isFetching;
  const items = activeDraft?.items ?? saved;

  const issues = useMemo(() => validatePriceBook(items), [items]);
  const rows = useMemo(() => filterRows(items, query, category), [items, query, category]);
  const categories = useMemo(() => categoriesOf(items), [items]);
  const savedBySku = useMemo(() => new Map(saved.map((i) => [i.sku, i])), [saved]);

  if (book.isPending) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
      </div>
    );
  }
  if (book.isError) {
    return (
      <div role="alert" className="py-10 text-center text-sm text-red-400">
        Impossibile caricare il listino. Riprova tra poco.
      </div>
    );
  }

  const dirty = activeDraft !== null && !itemsEqual(activeDraft.items, saved);
  const stale = activeDraft !== null && !awaitingRefresh && activeDraft.baseEtag !== etag;
  const busy = awaitingRefresh || save.isPending;
  const counts = diffCounts(saved, items);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const edit = (next: PriceBookItem[]) => {
    setNotice(null);
    setDraft({ baseEtag: activeDraft?.baseEtag ?? etag, savedAs: null, items: next });
  };

  const reload = () => {
    setDraft(null);
    setShowErrors(false);
    setOpenIndex(null);
    setNotice(null);
    save.reset();
    void book.refetch();
  };

  const startSave = () => {
    if (hasIssues(issues)) {
      setShowErrors(true);
      return;
    }
    setSaveOpen(true);
  };

  const confirmSave = (reason: string | null) => {
    if (!activeDraft || stale) return;
    save.mutate(
      { etag, body: { items: activeDraft.items, reason } },
      {
        onSuccess: (result) => {
          setDraft((prev) => (prev ? { ...prev, savedAs: result.etag } : prev));
          setSaveOpen(false);
          setShowErrors(false);
          setNotice(
            `Listino salvato (versione ${result.version}): ${result.added} aggiunte, ${result.changed} modificate, ${result.removed} rimosse.`,
          );
        },
      },
    );
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([`﻿${toCsv(items)}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'listino-syd.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const markOf = (item: PriceBookItem): 'new' | 'changed' | null => {
    const original = savedBySku.get(item.sku);
    if (!original) return 'new';
    return itemsEqual([original], [item]) ? null : 'changed';
  };

  const ignored = book.data.ignored_document;
  const changes = counts.added + counts.changed + counts.removed;

  return (
    <section className="space-y-5" aria-labelledby="pb-title" data-testid="price-book">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="pb-title" className="text-2xl font-semibold">
            Listino prezzi
          </h1>
          <p className="text-sm text-luxury-text/60">
            {items.length} voci · versione {book.data.version}
            {book.data.source === 'seed' ? ' (listino di base, mai modificato)' : ''}. È il listino con cui
            l&apos;assistente prepara i preventivi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-pressed={historyOpen}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer"
          >
            <History className="w-4 h-4" aria-hidden /> Storico
          </button>
          <button
            type="button"
            onClick={exportCsv}
            data-testid="pb-export"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden /> Esporta CSV
          </button>
        </div>
      </div>

      {ignored && (
        <p role="status" data-testid="pb-ignored" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          Nel database c&apos;era un listino salvato da un altro strumento, senza versione: non viene usato. Qui vedi il
          listino di base; salvando lo sostituisci.
        </p>
      )}
      {notice && (
        <p role="status" data-testid="notice" className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> {notice}
        </p>
      )}
      {stale && (
        <div role="alert" data-testid="stale-banner" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          <span className="flex-1 min-w-[12rem]">
            Il listino è stato modificato da un altro admin: le tue modifiche non salvate partono da una versione
            precedente.
          </span>
          <button type="button" onClick={reload} className="px-3 py-1.5 rounded-lg border border-amber-300/40 hover:bg-amber-300/10 cursor-pointer">
            Scarta le mie modifiche e ricarica
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem] sm:max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-luxury-text/40" aria-hidden />
          <label htmlFor="pb-search" className="sr-only">
            Cerca nel listino
          </label>
          <input
            id="pb-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Cerca per SKU, descrizione, categoria…"
            data-testid="pb-search"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50"
          />
        </div>
        <label className="sr-only" htmlFor="pb-category">
          Filtra per categoria
        </label>
        <select
          id="pb-category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-base md:text-sm"
        >
          <option value="">Tutte le categorie</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const next = [emptyItem(items), ...items];
            edit(next);
            setQuery('');
            setCategory('');
            setPage(0);
            setOpenIndex(0);
          }}
          disabled={busy}
          data-testid="pb-add"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden /> Aggiungi voce
        </button>
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={reload}
              disabled={busy}
              data-testid="pb-discard"
              className="px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50 cursor-pointer"
            >
              Annulla modifiche
            </button>
          )}
          <button
            type="button"
            onClick={startSave}
            disabled={!dirty || stale || busy}
            data-testid="pb-save"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" aria-hidden />
            Salva{dirty ? ` (${changes})` : ''}
          </button>
        </div>
      </div>

      {showErrors && hasIssues(issues) && (
        <div role="alert" data-testid="pb-issues" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          Correggi i campi evidenziati prima di salvare ({issues.rows.size} voci con problemi).
          {issues.list.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <datalist id={categoryListId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-luxury-text/60" data-testid="pb-empty">
          Nessuna voce corrisponde alla ricerca.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ item, index }) => (
            <PriceBookRow
              key={index}
              index={index}
              item={item}
              errors={showErrors ? issues.rows.get(index) : undefined}
              mark={markOf(item)}
              open={openIndex === index}
              categoryListId={categoryListId}
              onChange={(patch) => edit(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
              onRemove={() => {
                edit(items.filter((_, i) => i !== index));
                setOpenIndex(null);
              }}
            />
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagine del listino" className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
          >
            Precedente
          </button>
          <span className="tabular-nums text-luxury-text/60">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
          >
            Successiva
          </button>
        </nav>
      )}

      {historyOpen && <HistoryPanel />}

      <SaveDialog
        open={saveOpen}
        onOpenChange={(open) => {
          setSaveOpen(open);
          if (!open) save.reset();
        }}
        counts={counts}
        pending={save.isPending}
        error={save.error}
        onConfirm={confirmSave}
        onReload={() => {
          setSaveOpen(false);
          reload();
        }}
      />
    </section>
  );
}
