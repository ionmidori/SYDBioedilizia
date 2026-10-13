/**
 * Turns backend failures into what the admin should do next.
 *
 * `kind` drives the UI: a conflict, a lock or a changed status means the
 * dossier on screen is stale (offer a reload); the rest is a plain message.
 */
import { AdminApiError } from '@/lib/admin/admin-api';

export type AdminErrorKind = 'conflict' | 'locked' | 'transition' | 'denied' | 'invalid' | 'other';

export interface AdminErrorInfo {
  kind: AdminErrorKind;
  message: string;
  /** True when reloading the dossier is the right reaction. */
  stale: boolean;
}

export function describeAdminError(error: unknown): AdminErrorInfo {
  if (!(error instanceof AdminApiError)) {
    return { kind: 'other', message: 'Connessione non riuscita. Controlla la rete e riprova.', stale: false };
  }
  switch (error.errorCode) {
    case 'VERSION_CONFLICT':
      return {
        kind: 'conflict',
        message: 'Questi dati sono stati modificati da un altro admin nel frattempo. Ricarica per vedere la versione aggiornata.',
        stale: true,
      };
    case 'QUOTE_LOCKED':
      return {
        kind: 'locked',
        message: 'Il preventivo è in revisione da un altro admin. Riprova quando lo avrà rilasciato.',
        stale: true,
      };
    case 'INVALID_TRANSITION':
      return {
        kind: 'transition',
        message: 'Il preventivo ha cambiato stato nel frattempo, questa azione non è più disponibile.',
        stale: true,
      };
    case 'DELIVERY_PENDING':
      return {
        kind: 'transition',
        message: "L'email del preventivo è ancora in invio. Attendi che parta, poi potrai rivederlo.",
        stale: true,
      };
    case 'PRECONDITION_REQUIRED':
      return { kind: 'conflict', message: 'Versione del preventivo mancante: ricarica la pagina.', stale: true };
    case 'PRICE_BOOK_SKU_IN_USE': {
      const skus = Array.isArray(error.detail.skus) ? (error.detail.skus as unknown[]).map(String) : [];
      return {
        kind: 'invalid',
        message: `Queste voci sono usate dalle ricette dell'AI e non si possono eliminare: ${skus.slice(0, 10).join(', ')}.`,
        stale: false,
      };
    }
    case 'INVALID_IMAGE':
      return {
        kind: 'invalid',
        message: "Il file non è un'immagine utilizzabile: prova con un altro file (JPG, PNG o WebP).",
        stale: false,
      };
    case 'PORTFOLIO_UPLOAD_FAILED':
      return { kind: 'other', message: "Il salvataggio dell'immagine non è riuscito. Riprova tra poco.", stale: false };
    case 'LIFECYCLE_ALREADY_RUNNING':
      return {
        kind: 'locked',
        message: "Un'esecuzione del controllo GDPR è già in corso (anche quella automatica del job). Riprova tra qualche minuto.",
        stale: false,
      };
    case 'IDEMPOTENCY_KEY_REQUIRED':
      return { kind: 'other', message: 'Invio non valido: riapri la finestra e riprova.', stale: false };
    default:
      if (error.isAccessDenied) {
        return {
          kind: 'denied',
          message: 'Sessione scaduta o permessi insufficienti. Esci e accedi di nuovo.',
          stale: false,
        };
      }
      if (error.status === 422) {
        return { kind: 'invalid', message: 'I dati inseriti non sono validi. Controlla i campi e riprova.', stale: false };
      }
      return { kind: 'other', message: error.message || 'Operazione non riuscita. Riprova.', stale: false };
  }
}

/** Upload failures come from the file itself as often as from the server: say which. */
export function describeUploadError(error: unknown): AdminErrorInfo {
  if (error instanceof AdminApiError) {
    if (error.status === 413) {
      return { kind: 'invalid', message: "L'immagine è troppo grande: massimo 10 MB.", stale: false };
    }
    if (error.status === 400) {
      return { kind: 'invalid', message: 'Il file non sembra un\'immagine valida: usa JPG, PNG, WebP o GIF.', stale: false };
    }
  }
  return describeAdminError(error);
}
