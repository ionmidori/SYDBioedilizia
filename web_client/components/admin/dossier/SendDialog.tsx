'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegeneratePdf, useSendDefaults, useSendQuote } from '@/hooks/admin/use-admin';
import { sendQuoteBodySchema, type SendDefaults, type SendQuoteResponse } from '@/types/admin-quote';

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 15-minute link returned by the approval, if the admin just approved. */
  pdfPreviewUrl?: string | null;
  onSent: (result: SendQuoteResponse, to: string) => void;
  onReload?: () => void;
}

/** CC addresses typed as "a@x.it, b@y.it" (comma, semicolon or whitespace). */
export function parseCc(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const INPUT =
  'w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50';

/**
 * Send the approved PDF. Everything is pre-filled from the server (recipient,
 * subject) and stays editable; nothing leaves until the admin confirms here.
 */
export function SendDialog({ projectId, open, onOpenChange, ...rest }: Props) {
  const defaults = useSendDefaults(projectId, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-luxury-bg border-luxury-gold/20 text-luxury-text">
        <DialogHeader>
          <DialogTitle>Invia il preventivo al cliente</DialogTitle>
          <DialogDescription>
            Controlla destinatario e testo: puoi cambiare tutto prima dell&apos;invio.
          </DialogDescription>
        </DialogHeader>
        {defaults.isPending && open ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
          </div>
        ) : defaults.isError ? (
          <ErrorBanner error={defaults.error} onReload={rest.onReload} />
        ) : open && defaults.data ? (
          // Mounted per opening, so each opening gets its own Idempotency-Key.
          <SendForm projectId={projectId} defaults={defaults.data} onCancel={() => onOpenChange(false)} {...rest} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SendForm({
  projectId,
  defaults,
  pdfPreviewUrl,
  onSent,
  onReload,
  onCancel,
}: Omit<Props, 'open' | 'onOpenChange'> & { defaults: SendDefaults; onCancel: () => void }) {
  const [to, setTo] = useState(defaults.to ?? '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState('');
  // One key per opening: a retry after a lost response is a no-op, not a second email.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [previewUrl, setPreviewUrl] = useState<string | null>(pdfPreviewUrl ?? null);

  const send = useSendQuote(projectId);
  const regenerate = useRegeneratePdf(projectId);

  const parsed = sendQuoteBodySchema.safeParse({
    to: to.trim(),
    cc: parseCc(cc),
    subject: subject.trim() || null,
    message: message.trim() || null,
  });
  const toInvalid = to.trim() !== '' && !sendQuoteBodySchema.shape.to.safeParse(to.trim()).success;
  const ccInvalid = cc.trim() !== '' && !sendQuoteBodySchema.shape.cc.safeParse(parseCc(cc)).success;
  const canSend = parsed.success && defaults.pdf_ready && !send.isPending;

  const submit = () => {
    if (!parsed.success) return;
    send.mutate(
      { body: parsed.data, idempotencyKey },
      { onSuccess: (result) => onSent(result, parsed.data.to) },
    );
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      {!defaults.pdf_ready && (
        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300 space-y-2">
          <p>Il PDF di questa revisione non è pronto: senza non si può inviare.</p>
          <button
            type="button"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate(undefined, { onSuccess: (r) => setPreviewUrl(r.pdf_preview_url ?? null) })}
            className="px-3 py-1.5 rounded-lg border border-amber-300/40 hover:bg-amber-300/10 disabled:opacity-50 cursor-pointer"
          >
            {regenerate.isPending ? 'Generazione…' : 'Rigenera il PDF'}
          </button>
          <ErrorBanner error={regenerate.error} />
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm">A (destinatario)</span>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          autoComplete="off"
          aria-invalid={toInvalid}
          data-testid="send-to"
          className={INPUT}
        />
        {defaults.to_source === 'none' && (
          <span className="block text-xs text-amber-400">Il cliente non ha lasciato un&apos;email: inseriscila a mano.</span>
        )}
        {defaults.to_source === 'profile' && (
          <span className="block text-xs text-luxury-text/50">Presa dal profilo attuale del cliente.</span>
        )}
        {toInvalid && <span role="alert" className="block text-xs text-red-400">Indirizzo email non valido.</span>}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm">In copia (facoltativo, max 3)</span>
        <input
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="nome@esempio.it, altro@esempio.it"
          autoComplete="off"
          aria-invalid={ccInvalid}
          data-testid="send-cc"
          className={INPUT}
        />
        {ccInvalid && <span role="alert" className="block text-xs text-red-400">Massimo 3 indirizzi email validi.</span>}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm">Oggetto</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          data-testid="send-subject"
          className={INPUT}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm">Messaggio personale (facoltativo)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Una riga in più per il cliente, aggiunta al testo standard."
          data-testid="send-message"
          className={INPUT}
        />
      </label>

      <details className="rounded-xl border border-white/10 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-luxury-text/70">Testo standard dell&apos;email</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-luxury-text/70" data-testid="send-body-preview">
          {defaults.body_preview}
        </pre>
      </details>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-luxury-text/70">
          <FileText className="w-4 h-4" aria-hidden /> Allegato: <span className="font-medium">{defaults.attachment_name}</span>{' '}
          (rev. {defaults.revision})
        </span>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="send-pdf-preview"
            className="text-luxury-gold hover:underline"
          >
            Apri anteprima PDF
          </a>
        )}
      </div>

      <ErrorBanner error={send.error} onReload={onReload} />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer">
          Annulla
        </button>
        <button
          type="submit"
          disabled={!canSend}
          data-testid="send-confirm"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
        >
          {send.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          Invia email
        </button>
      </div>
    </form>
  );
}
