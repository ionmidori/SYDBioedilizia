'use client';

import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** What the save changes (counts, the changed parts…): shown between the text and the reason. */
  summary: ReactNode;
  confirmLabel: string;
  reasonPlaceholder?: string;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string | null) => void;
  onReload?: () => void;
}

/** Shows what a save changes and asks why, before the AI and the site start using the new data. */
export function SaveDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-canvas border-line text-ink">
        {open && <SaveForm {...rest} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SaveForm({
  title,
  description,
  summary,
  confirmLabel,
  reasonPlaceholder,
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
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {summary}
      <label className="block space-y-1.5">
        <span className="text-sm">Motivo (facoltativo)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={reasonPlaceholder}
          data-testid="save-reason"
          className="w-full rounded-xl bg-surface border border-line px-3 py-2 text-base md:text-sm focus:outline-hidden focus:border-accent"
        />
      </label>
      <ErrorBanner error={error} onReload={onReload} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-line text-sm hover:bg-surface cursor-pointer">
          Annulla
        </button>
        <button
          type="submit"
          disabled={pending}
          data-testid="save-confirm"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-on-accent text-sm font-medium disabled:opacity-50 cursor-pointer"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}
