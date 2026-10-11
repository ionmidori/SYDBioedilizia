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
        message: 'Il preventivo è stato modificato da un altro admin. Ricarica per vedere la versione aggiornata.',
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
