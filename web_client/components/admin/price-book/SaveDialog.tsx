'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DiffCounts } from '@/lib/admin/price-book-logic';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: DiffCounts;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string | null) => void;
  onReload?: () => void;
}

/** Shows what a save changes, and why, before the AI starts using the new prices. */
export function SaveDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-luxury-bg border-luxury-gold/20 text-luxury-text">
        {open && <SaveForm {...rest} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SaveForm({
  counts,
  pending,
  error,
  onConfirm,
  onReload,
  onCancel,
}: Omit<Props, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(reason.trim() || null);
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>Salvare il listino?</DialogTitle>
        <DialogDescription>
          L&apos;assistente userà i nuovi prezzi dai prossimi preventivi (entro un minuto su tutti i server). Ogni
          versione resta nello storico.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-3 gap-3 text-center" data-testid="save-counts">
        <Count label="Aggiunte" value={counts.added} tone="text-emerald-400" />
        <Count label="Modificate" value={counts.changed} tone="text-amber-400" />
        <Count label="Rimosse" value={counts.removed} tone="text-red-400" />
      </dl>
      <label className="block space-y-1.5">
        <span className="text-sm">Motivo (facoltativo)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Es. Aggiornamento prezzi 2026"
          data-testid="save-reason"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50"
        />
      </label>
      <ErrorBanner error={error} onReload={onReload} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer">
          Annulla
        </button>
        <button
          type="submit"
          disabled={pending}
          data-testid="save-confirm"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          Salva listino
        </button>
      </div>
    </form>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 py-2 flex flex-col-reverse">
      <dt className="text-xs text-luxury-text/60">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
