'use client';

import { Loader2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { formatEuro } from '@/components/admin/quote-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteNumber: string;
  clientName: string;
  version: number;
  itemCount: number;
  grandTotal: number;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onReload?: () => void;
}

/**
 * Approving freezes the version on screen and renders its PDF. It never emails
 * the client: sending is a separate, explicit step.
 */
export function ApproveDialog({
  open,
  onOpenChange,
  quoteNumber,
  clientName,
  version,
  itemCount,
  grandTotal,
  pending,
  error,
  onConfirm,
  onReload,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-luxury-bg border-luxury-gold/20 text-luxury-text">
        <DialogHeader>
          <DialogTitle>Approvare il preventivo?</DialogTitle>
          <DialogDescription>
            Verrà approvata la revisione {version} e generato il PDF. Non parte nessuna email: l&apos;invio al cliente è il
            passo successivo.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="approve-summary">
          <dt className="text-luxury-text/60">Preventivo</dt>
          <dd className="font-medium tabular-nums">{quoteNumber}</dd>
          <dt className="text-luxury-text/60">Cliente</dt>
          <dd className="font-medium">{clientName}</dd>
          <dt className="text-luxury-text/60">Voci</dt>
          <dd>{itemCount}</dd>
          <dt className="text-luxury-text/60">Totale IVA inclusa</dt>
          <dd className="font-semibold tabular-nums">{formatEuro(grandTotal)}</dd>
        </dl>
        <ErrorBanner error={error} onReload={onReload} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            data-testid="approve-confirm"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            Approva
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
