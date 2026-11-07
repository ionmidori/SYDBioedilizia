import { AlertCircle, Mail, MapPin, Phone } from 'lucide-react';

import { formatDateTime, formatEuro } from '@/components/admin/quote-status';
import type { ClientLive } from '@/types/admin-quote';
import type { ClientSnapshot, QuoteRequest } from '@/types/quote';

const CHANNEL_LABEL: Record<string, string> = {
  chat: "Chat con l'assistente",
  dashboard: 'Dashboard del cliente',
};

const CARD = 'glass-premium rounded-2xl p-4 border border-line';
const TITLE = 'text-xs font-semibold uppercase tracking-wide text-accent-ink mb-2';

export function clientDisplayName(client: ClientSnapshot | null | undefined): string {
  return client?.display_name || (client?.is_guest ? 'Cliente ospite' : 'Cliente senza nome');
}

/** Who asked. If the live profile differs from the snapshot, both are shown. */
export function ClientCard({
  client,
  live,
  profileChanged,
}: {
  client: ClientSnapshot | null | undefined;
  live: ClientLive | null | undefined;
  profileChanged: boolean;
}) {
  return (
    <section className={CARD} data-testid="client-card">
      <h2 className={TITLE}>Cliente</h2>
      <p className="font-medium" data-testid="client-name">
        {clientDisplayName(client)}
      </p>
      <ul className="mt-1.5 space-y-1 text-sm text-ink-muted">
        {client?.email && (
          <li className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <a href={`mailto:${client.email}`} className="break-all hover:text-accent-ink">
              {client.email}
            </a>
          </li>
        )}
        {client?.phone && (
          <li className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <a href={`tel:${client.phone}`} className="hover:text-accent-ink">
              {client.phone}
            </a>
          </li>
        )}
        {!client?.email && !client?.phone && <li>Nessun recapito salvato.</li>}
      </ul>
      {client?.captured_at && (
        <p className="mt-2 text-xs text-ink-subtle">Dati rilevati il {formatDateTime(client.captured_at)}</p>
      )}
      {profileChanged && live && (
        <div
          data-testid="profile-changed"
          className="mt-3 rounded-xl border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-ink space-y-1"
        >
          <p className="inline-flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden /> Il profilo del cliente è cambiato
          </p>
          <p>
            Ora: {live.display_name ?? '—'} · {live.email ?? 'nessuna email'}
            {live.phone ? ` · ${live.phone}` : ''}
          </p>
        </div>
      )}
    </section>
  );
}

/** What the client wants: the description is the first thing a reviewer needs. */
export function RequestCard({
  request,
  projectName,
  createdAt,
}: {
  request: QuoteRequest | null | undefined;
  projectName: string | null | undefined;
  createdAt: string | undefined;
}) {
  return (
    <section className={CARD} data-testid="request-card">
      <h2 className={TITLE}>Cosa chiede il cliente</h2>
      {projectName && <p className="font-medium">{projectName}</p>}
      <p className="mt-1 text-sm whitespace-pre-line" data-testid="request-summary">
        {request?.summary || 'Nessuna descrizione disponibile.'}
      </p>
      {request?.technical_notes && (
        <p className="mt-2 text-sm text-ink-muted whitespace-pre-line">{request.technical_notes}</p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-muted">
        {request?.address && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" aria-hidden />
            <dt className="sr-only">Indirizzo</dt>
            <dd>{request.address}</dd>
          </div>
        )}
        {request?.footage_sqm != null && (
          <div className="flex gap-1.5">
            <dt>Superficie:</dt>
            <dd className="tabular-nums">{request.footage_sqm} mq</dd>
          </div>
        )}
        {request?.budget_cap != null && (
          <div className="flex gap-1.5">
            <dt>Budget:</dt>
            <dd className="tabular-nums">{formatEuro(request.budget_cap)}</dd>
          </div>
        )}
        {request?.channel && (
          <div className="flex gap-1.5">
            <dt>Canale:</dt>
            <dd>{CHANNEL_LABEL[request.channel] ?? request.channel}</dd>
          </div>
        )}
        {createdAt && (
          <div className="flex gap-1.5">
            <dt>Richiesta del:</dt>
            <dd>{formatDateTime(createdAt)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
