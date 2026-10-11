'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Lock, Save } from 'lucide-react';

import { ApproveDialog } from '@/components/admin/dossier/ApproveDialog';
import { ClientCard, clientDisplayName, RequestCard } from '@/components/admin/dossier/DossierCards';
import { DeliveryLog } from '@/components/admin/dossier/DeliveryLog';
import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { MediaGallery } from '@/components/admin/dossier/MediaGallery';
import { QuoteItemsEditor } from '@/components/admin/dossier/QuoteItemsEditor';
import { ReasonDialog } from '@/components/admin/dossier/ReasonDialog';
import { RevisionTimeline } from '@/components/admin/dossier/RevisionTimeline';
import { SendDialog } from '@/components/admin/dossier/SendDialog';
import { StatusChip } from '@/components/admin/StatusChip';
import { DELIVERY_STATUS_CHIP, formatEuro, QUOTE_STATUS_CHIP } from '@/components/admin/quote-status';
import {
  useAdminDossier,
  useAdminMe,
  useApproveQuote,
  useClaimQuote,
  useEditQuote,
  useNow,
  useRegeneratePdf,
  useRejectQuote,
  useReleaseQuote,
  useReopenQuote,
} from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';
import { computeTotals, itemsEqual, lineTotal, validateItems } from '@/lib/admin/quote-math';
import type { EditQuoteBody, SendQuoteResponse } from '@/types/admin-quote';
import type { QuoteItem, QuoteStatus } from '@/types/quote';

const REVIEWABLE: ReadonlyArray<QuoteStatus> = ['draft', 'pending_review', 'in_review'];
/** Mirrors LOCK_LEASE in backend_python/src/services/admin_quotes.py. */
const LOCK_MINUTES = 30;

/**
 * Unsaved edits, tied to the version they started from (the ETag).
 * `savedAs` is set once the server accepted them: the draft stays on screen
 * until the dossier carries that ETag, so a save never flashes the old values.
 */
interface Draft {
  baseEtag: string;
  savedAs: string | null;
  items: QuoteItem[];
  notes: string;
  vatPercent: number;
}

const toPercent = (rate: number): number => Math.round(rate * 10000) / 100;

/**
 * The dossier of one quote: who asked, what for, the photos and renders, the
 * draft lines — and the decision (edit, approve or reject, then send).
 *
 * Writes are guarded by the ETag the dossier came with (If-Match): if someone
 * else changed the quote meanwhile, the server answers 409 and this view asks
 * for a reload instead of overwriting their work.
 */
export function DossierView({ projectId }: { projectId: string }) {
  const dossier = useAdminDossier(projectId);
  const me = useAdminMe();
  const now = useNow(60_000);

  const claim = useClaimQuote(projectId);
  const release = useReleaseQuote(projectId);
  const edit = useEditQuote(projectId);
  const approve = useApproveQuote(projectId);
  const reject = useRejectQuote(projectId);
  const reopen = useReopenQuote(projectId);
  const regenerate = useRegeneratePdf(projectId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'reopen' | 'send' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const quote = dossier.data?.quote;
  const etag = dossier.data?.etag ?? '';
  const savedItems = useMemo(() => quote?.items ?? [], [quote]);
  const savedNotes = quote?.admin_notes ?? '';
  const savedVat = toPercent(quote?.financials.vat_rate ?? 0.22);

  // A draft the server already accepted disappears when the dossier catches up.
  const activeDraft = draft && draft.savedAs && draft.savedAs === etag ? null : draft;
  const awaitingRefresh = !!activeDraft?.savedAs && dossier.isFetching;

  const items = activeDraft?.items ?? savedItems;
  const notes = activeDraft?.notes ?? savedNotes;
  const vatPercent = activeDraft?.vatPercent ?? savedVat;

  const itemErrors = useMemo(() => validateItems(items), [items]);
  const vatInvalid = !Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 50;
  const totals = useMemo(() => computeTotals(items, vatInvalid ? 0 : vatPercent / 100), [items, vatPercent, vatInvalid]);

  if (dossier.isPending) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
      </div>
    );
  }
  if (dossier.isError || !quote) {
    const notFound = dossier.error instanceof AdminApiError && dossier.error.status === 404;
    return (
      <div role="alert" className="py-10 text-center space-y-3">
        <p className="text-sm text-red-400">{notFound ? 'Preventivo non trovato.' : 'Impossibile caricare il preventivo.'}</p>
        <Link href="/admin/quotes" className="text-sm text-luxury-gold hover:underline">
          Torna ai preventivi
        </Link>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const status = quote.status;
  const review = quote.review;
  const lockedAt = review?.locked_at ? Date.parse(review.locked_at) : Number.NaN;
  const lockActive =
    !!review?.locked_by && Number.isFinite(lockedAt) && now - lockedAt < LOCK_MINUTES * 60_000;
  const lockedByMe = lockActive && review?.locked_by === me.data?.uid;
  const lockedByOther = lockActive && !lockedByMe;

  const reviewable = REVIEWABLE.includes(status);
  const canEdit = reviewable && !lockedByOther;
  // Edits only exist while the quote is editable: once it is not (rejected,
  // locked by someone else…) the saved version is what is shown.
  const draftShown = canEdit && activeDraft !== null;
  const stale = draftShown && !awaitingRefresh && activeDraft.baseEtag !== etag;
  const dirty =
    draftShown &&
    (!itemsEqual(activeDraft.items, savedItems) ||
      activeDraft.notes !== savedNotes ||
      activeDraft.vatPercent !== savedVat);
  const shownItems = draftShown ? items : savedItems;
  const shownNotes = draftShown ? notes : savedNotes;
  const shownVat = draftShown ? vatPercent : savedVat;
  const shownTotals = draftShown
    ? totals
    : {
        subtotal: quote.financials.subtotal,
        vatAmount: quote.financials.vat_amount,
        grandTotal: quote.financials.grand_total,
      };
  const hasLineErrors = draftShown && (itemErrors.size > 0 || vatInvalid);
  const busy =
    awaitingRefresh ||
    claim.isPending ||
    release.isPending ||
    edit.isPending ||
    approve.isPending ||
    reject.isPending ||
    reopen.isPending;

  const approvedRevision = review?.approved_revision ?? null;
  const pdfReady =
    !!quote.pdf_blob_path && (approvedRevision === null || quote.pdf_revision === approvedRevision);

  const statusChip = QUOTE_STATUS_CHIP[status];
  const deliveryChip = DELIVERY_STATUS_CHIP[quote.delivery_status];
  const quoteNumber = quote.quote_number ?? 'Senza numero';
  const clientName = clientDisplayName(quote.client_snapshot);

  // ── Actions ────────────────────────────────────────────────────────────────
  const touch = (patch: Partial<Pick<Draft, 'items' | 'notes' | 'vatPercent'>>) =>
    setDraft({
      baseEtag: activeDraft?.baseEtag ?? etag,
      savedAs: null,
      items: activeDraft?.items ?? savedItems,
      notes: activeDraft?.notes ?? savedNotes,
      vatPercent: activeDraft?.vatPercent ?? savedVat,
      ...patch,
    });

  const resetErrors = () => {
    for (const mutation of [claim, release, edit, approve, reject, reopen, regenerate]) mutation.reset();
  };

  const reload = () => {
    setDraft(null);
    setShowErrors(false);
    setNotice(null);
    resetErrors();
    void dossier.refetch();
  };

  const save = () => {
    if (!activeDraft || stale || busy) return;
    if (hasLineErrors) {
      setShowErrors(true);
      return;
    }
    const body: EditQuoteBody = {};
    if (!itemsEqual(activeDraft.items, savedItems)) body.items = activeDraft.items.map((i) => ({ ...i, total: lineTotal(i) }));
    if (activeDraft.notes !== savedNotes) body.admin_notes = activeDraft.notes;
    if (activeDraft.vatPercent !== savedVat) body.vat_rate = activeDraft.vatPercent / 100;
    setNotice(null);
    edit.mutate(
      { etag, body },
      {
        onSuccess: (result) => {
          // Keep showing the saved edits until the refetched dossier carries the new ETag.
          setDraft((prev) => (prev ? { ...prev, savedAs: result.etag } : prev));
          setShowErrors(false);
          setNotice(`Modifiche salvate: nuova revisione ${result.version}.`);
        },
      },
    );
  };

  const onSent = (result: SendQuoteResponse, to: string) => {
    setDialog(null);
    const outcome = result.duplicate
      ? 'Questo invio era già stato registrato.'
      : result.delivery_status === 'queued'
        ? `Email messa in coda per ${to}: partirà a breve.`
        : `Email inviata a ${to}.`;
    setNotice(outcome);
  };

  return (
    <article className="space-y-5" data-testid="dossier-view">
      <Link href="/admin/quotes" className="inline-flex items-center gap-1.5 text-sm text-luxury-text/60 hover:text-luxury-text">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Preventivi
      </Link>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold tabular-nums text-luxury-gold" data-testid="dossier-number">
          {quoteNumber}
        </h1>
        <span className="text-lg text-luxury-text/80" data-testid="dossier-client">
          {clientName}
        </span>
        <StatusChip label={statusChip.label} className={statusChip.className} testId="dossier-status" />
        {deliveryChip && <StatusChip label={deliveryChip.label} className={deliveryChip.className} testId="dossier-delivery" />}
        <span className="ml-auto text-xl font-semibold tabular-nums" data-testid="dossier-total">
          {formatEuro(dirty ? totals.grandTotal : quote.financials.grand_total)}
        </span>
      </header>

      {/* ── Notices ─────────────────────────────────────────────────────────── */}
      {notice && (
        <p
          role="status"
          data-testid="notice"
          className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> {notice}
        </p>
      )}
      {stale && (
        <div
          role="alert"
          data-testid="stale-banner"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300"
        >
          <span className="flex-1 min-w-[12rem]">
            Modificato da un altro admin: le tue modifiche non salvate partono da una versione precedente.
          </span>
          <button type="button" onClick={reload} className="px-3 py-1.5 rounded-lg border border-amber-300/40 hover:bg-amber-300/10 cursor-pointer">
            Scarta le mie modifiche e ricarica
          </button>
        </div>
      )}
      {lockedByOther && (
        <p role="status" data-testid="locked-banner" className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-300">
          <Lock className="w-4 h-4 shrink-0" aria-hidden /> In revisione da un altro admin: puoi consultarlo ma non modificarlo.
        </p>
      )}
      {(status === 'approved' || status === 'sent') && !pdfReady && (
        <div role="alert" data-testid="pdf-missing" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          <span className="flex-1 min-w-[12rem]">Il PDF della revisione approvata non è disponibile.</span>
          <button
            type="button"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate(undefined, { onSuccess: (r) => setPdfPreviewUrl(r.pdf_preview_url ?? null) })}
            className="px-3 py-1.5 rounded-lg border border-amber-300/40 hover:bg-amber-300/10 disabled:opacity-50 cursor-pointer"
          >
            {regenerate.isPending ? 'Generazione…' : 'Rigenera il PDF'}
          </button>
        </div>
      )}
      {status === 'approved' && pdfReady && pdfPreviewUrl && (
        <p className="text-sm">
          <a href={pdfPreviewUrl} target="_blank" rel="noopener noreferrer" data-testid="pdf-preview-link" className="text-luxury-gold hover:underline">
            Apri l&apos;anteprima del PDF approvato
          </a>{' '}
          <span className="text-luxury-text/50">(il link vale 15 minuti)</span>
        </p>
      )}
      {review?.reason && (status === 'rejected' || status === 'in_review') && (
        <p className="text-sm text-luxury-text/70" data-testid="review-reason">
          Ultimo motivo registrato: {review.reason}
        </p>
      )}
      <ErrorBanner error={claim.error ?? release.error ?? edit.error ?? regenerate.error} onReload={reload} />

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Azioni sul preventivo">
        {reviewable && !lockedByOther && !lockedByMe && (
          <ActionButton onClick={() => claim.mutate()} disabled={busy} testId="btn-claim">
            Prendi in carico
          </ActionButton>
        )}
        {reviewable && lockedByMe && (
          <ActionButton onClick={() => release.mutate()} disabled={busy} testId="btn-release">
            Rilascia
          </ActionButton>
        )}
        {canEdit && dirty && (
          <ActionButton onClick={save} disabled={busy || stale} primary testId="btn-save">
            {edit.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
            Salva modifiche
          </ActionButton>
        )}
        {draftShown && (
          <ActionButton onClick={reload} disabled={busy} testId="btn-discard">
            Annulla modifiche
          </ActionButton>
        )}
        {canEdit && (
          <ActionButton
            onClick={() => setDialog('approve')}
            disabled={busy || dirty || stale || shownItems.length === 0}
            primary={!dirty}
            testId="btn-approve"
            title={dirty ? 'Salva prima le modifiche' : shownItems.length === 0 ? 'Aggiungi almeno una voce' : undefined}
          >
            Approva
          </ActionButton>
        )}
        {canEdit && (
          <ActionButton onClick={() => setDialog('reject')} disabled={busy} danger testId="btn-reject">
            Rifiuta
          </ActionButton>
        )}
        {(status === 'approved' || status === 'sent') && (
          <ActionButton onClick={() => setDialog('send')} disabled={busy || !pdfReady} primary testId="btn-send">
            {status === 'sent' ? 'Invia di nuovo' : 'Invia al cliente'}
          </ActionButton>
        )}
        {(status === 'approved' || status === 'rejected') && (
          <ActionButton onClick={() => setDialog('reopen')} disabled={busy} testId="btn-reopen">
            Riapri per modificare
          </ActionButton>
        )}
        {canEdit && dirty && showErrors && hasLineErrors && (
          <span role="alert" className="text-sm text-red-400">
            Correggi i campi evidenziati prima di salvare.
          </span>
        )}
      </div>
      {canEdit && dirty && !stale && (
        <p className="text-xs text-luxury-text/50">Hai modifiche non salvate: salvale per poter approvare.</p>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <RequestCard request={quote.request} projectName={dossier.data.project_name} createdAt={quote.created_at} />
          <MediaGallery projectId={projectId} media={dossier.data.media} />
          <QuoteItemsEditor
            items={shownItems}
            saved={savedItems}
            errors={showErrors ? itemErrors : new Map()}
            readOnly={!canEdit}
            onChange={(next) => touch({ items: next })}
          />
          <section className="glass-premium rounded-2xl p-4 border border-white/5 space-y-4" data-testid="totals-panel">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-luxury-gold">
                Note per il cliente <span className="normal-case font-normal text-luxury-text/50">(compaiono nel PDF)</span>
              </span>
              <textarea
                value={shownNotes}
                disabled={!canEdit}
                onChange={(e) => touch({ notes: e.target.value })}
                rows={3}
                maxLength={4000}
                data-testid="admin-notes"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50 disabled:opacity-60"
              />
            </label>
            <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-luxury-text/70">Imponibile</dt>
                <dd className="tabular-nums" data-testid="totals-subtotal">{formatEuro(shownTotals.subtotal)}</dd>
              </div>
              <div className="flex justify-between items-center gap-4">
                <dt className="text-luxury-text/70">
                  <label htmlFor="vat-percent">IVA %</label>
                </dt>
                <dd className="flex items-center gap-2">
                  <input
                    id="vat-percent"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    max={50}
                    value={Number.isFinite(shownVat) ? shownVat : ''}
                    disabled={!canEdit}
                    onChange={(e) => touch({ vatPercent: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                    aria-invalid={draftShown && vatInvalid}
                    data-testid="vat-percent"
                    className="w-20 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-right text-base md:text-sm tabular-nums disabled:opacity-60"
                  />
                  <span className="tabular-nums w-24 text-right" data-testid="totals-vat">{formatEuro(shownTotals.vatAmount)}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/10 pt-1.5 text-base font-semibold">
                <dt>Totale</dt>
                <dd className="tabular-nums" data-testid="totals-grand">{formatEuro(shownTotals.grandTotal)}</dd>
              </div>
              {dirty && (
                <div className="flex justify-between gap-4 text-xs text-luxury-text/50">
                  <dt>Versione salvata</dt>
                  <dd className="tabular-nums">{formatEuro(quote.financials.grand_total)}</dd>
                </div>
              )}
            </dl>
            {vatInvalid && showErrors && <p role="alert" className="text-sm text-red-400">L&apos;IVA deve essere tra 0 e 50%.</p>}
            <p className="text-xs text-luxury-text/40">Il server ricalcola i totali al salvataggio.</p>
          </section>
        </div>

        <div className="space-y-4 min-w-0">
          <ClientCard client={quote.client_snapshot} live={dossier.data.client_live} profileChanged={dossier.data.client_profile_changed} />
          <RevisionTimeline projectId={projectId} revisions={dossier.data.revisions} approvedRevision={approvedRevision} />
          <DeliveryLog deliveries={dossier.data.deliveries} />
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <ApproveDialog
        open={dialog === 'approve'}
        onOpenChange={(open) => {
          setDialog(open ? 'approve' : null);
          if (!open) approve.reset();
        }}
        quoteNumber={quoteNumber}
        clientName={clientName}
        version={quote.version}
        itemCount={savedItems.length}
        grandTotal={quote.financials.grand_total}
        pending={approve.isPending}
        error={approve.error}
        onReload={() => {
          setDialog(null);
          reload();
        }}
        onConfirm={() =>
          approve.mutate(etag, {
            onSuccess: (result) => {
              setDialog(null);
              setPdfPreviewUrl(result.pdf_preview_url ?? null);
              setNotice(
                result.pdf_ready === false
                  ? `Preventivo approvato (revisione ${result.version}), ma il PDF non è stato generato: usa «Rigenera il PDF».`
                  : `Preventivo approvato (revisione ${result.version}). Ora puoi inviarlo al cliente.`,
              );
            },
          })
        }
      />
      <ReasonDialog
        open={dialog === 'reject'}
        onOpenChange={(open) => {
          setDialog(open ? 'reject' : null);
          if (!open) reject.reset();
        }}
        title="Rifiutare il preventivo?"
        description="Il preventivo passa allo stato «Rifiutato». Potrai riaprirlo in seguito."
        confirmLabel="Rifiuta"
        destructive
        pending={reject.isPending}
        error={reject.error}
        onReload={() => {
          setDialog(null);
          reload();
        }}
        onConfirm={(reason) =>
          reject.mutate(reason, {
            onSuccess: () => {
              setDialog(null);
              setDraft(null);
              setNotice('Preventivo rifiutato.');
            },
          })
        }
      />
      <ReasonDialog
        open={dialog === 'reopen'}
        onOpenChange={(open) => {
          setDialog(open ? 'reopen' : null);
          if (!open) reopen.reset();
        }}
        title="Riaprire il preventivo?"
        description="Torna «In revisione» e potrai modificarlo: dovrai approvarlo di nuovo prima di inviarlo."
        confirmLabel="Riapri"
        pending={reopen.isPending}
        error={reopen.error}
        onReload={() => {
          setDialog(null);
          reload();
        }}
        onConfirm={(reason) =>
          reopen.mutate(reason, {
            onSuccess: () => {
              setDialog(null);
              setPdfPreviewUrl(null);
              setNotice('Preventivo riaperto: ora è in revisione.');
            },
          })
        }
      />
      <SendDialog
        projectId={projectId}
        open={dialog === 'send'}
        onOpenChange={(open) => setDialog(open ? 'send' : null)}
        pdfPreviewUrl={pdfPreviewUrl}
        onSent={onSent}
        onReload={() => {
          setDialog(null);
          reload();
        }}
      />
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
  danger,
  testId,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  testId: string;
  title?: string;
}) {
  const tone = primary
    ? 'bg-luxury-gold text-black font-medium border-transparent'
    : danger
      ? 'border-red-400/40 text-red-300 hover:bg-red-400/10'
      : 'border-white/10 hover:bg-white/5';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${tone}`}
    >
      {children}
    </button>
  );
}
