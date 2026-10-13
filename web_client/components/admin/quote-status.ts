/** Italian labels + chip styles for review and delivery states (admin console). */
import type { BatchStatus } from '@/types/admin-content';
import type { DeliveryRecordStatus, QuoteDeliveryStatus, QuoteStatus } from '@/types/quote';

interface Chip {
  label: string;
  className: string;
}

const AMBER = 'text-amber-400 bg-amber-400/10 border-amber-400/25';
const BLUE = 'text-sky-400 bg-sky-400/10 border-sky-400/25';
const GREEN = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25';
const RED = 'text-red-400 bg-red-400/10 border-red-400/25';
const GREY = 'text-luxury-text/60 bg-white/5 border-white/10';

export const QUOTE_STATUS_CHIP: Record<QuoteStatus, Chip> = {
  draft: { label: 'Bozza non inviata', className: GREY },
  pending_review: { label: 'Da revisionare', className: AMBER },
  in_review: { label: 'In revisione', className: BLUE },
  approved: { label: 'Approvato', className: GREEN },
  sent: { label: 'Inviato', className: GREEN },
  rejected: { label: 'Rifiutato', className: RED },
  deleted: { label: 'Eliminato', className: GREY },
};

export const DELIVERY_STATUS_CHIP: Record<QuoteDeliveryStatus | DeliveryRecordStatus, Chip | null> = {
  none: null,
  queued: { label: 'Email in coda', className: AMBER },
  sent: { label: 'Email inviata', className: BLUE },
  delivered: { label: 'Email consegnata', className: GREEN },
  bounced: { label: 'Email rimbalzata', className: RED },
  complained: { label: 'Segnalata come spam', className: RED },
  failed: { label: 'Invio fallito', className: RED },
};

export const BATCH_STATUS_CHIP: Record<BatchStatus, Chip> = {
  draft: { label: 'Bozza', className: GREY },
  submitted: { label: 'Da revisionare', className: AMBER },
  partially_approved: { label: 'Parzialmente deciso', className: BLUE },
  approved: { label: 'Approvato', className: GREEN },
  rejected: { label: 'Rifiutato', className: RED },
};

/** Inbox filters (tab → backend `status` query). */
export const INBOX_FILTERS = [
  { id: 'open', label: 'Da lavorare', status: 'open' },
  { id: 'approved', label: 'Approvati', status: 'approved' },
  { id: 'sent', label: 'Inviati', status: 'sent' },
  { id: 'rejected', label: 'Rifiutati', status: 'rejected' },
  { id: 'all', label: 'Tutti', status: undefined },
] as const;

export type InboxFilterId = (typeof INBOX_FILTERS)[number]['id'];

export function formatEuro(value: number): string {
  return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
