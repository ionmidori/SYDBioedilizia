'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { reasonBodySchema } from '@/types/admin-quote';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Destructive actions (reject) get the red button. */
  destructive?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
  onReload?: () => void;
}

/** Reject / reopen: both need a written reason, stored in the audit trail. */
export function ReasonDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-luxury-bg border-luxury-gold/20 text-luxury-text">
        {/* Mounted only while open: the typed reason never leaks into the next use. */}
        {open && <ReasonForm {...rest} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  error,
  onConfirm,
  onReload,
  onCancel,
}: Omit<Props, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const parsed = reasonBodySchema.safeParse({ reason: reason.trim() });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed.success) onConfirm(parsed.data.reason);
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <label className="block space-y-1.5">
        <span className="text-sm">Motivo (obbligatorio)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          data-testid="reason-input"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50"
        />
        <span className="block text-xs text-luxury-text/50">Almeno 3 caratteri. Resta nello storico del preventivo.</span>
      </label>
      <ErrorBanner error={error} onReload={onReload} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer">
          Annulla
        </button>
        <button
          type="submit"
          disabled={!parsed.success || pending}
          data-testid="reason-confirm"
          className={
            destructive
              ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/80 text-white text-sm disabled:opacity-50 cursor-pointer'
              : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer'
          }
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}
