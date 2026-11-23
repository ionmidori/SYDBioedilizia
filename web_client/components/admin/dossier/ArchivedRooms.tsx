import { formatDateTime } from '@/components/admin/quote-status';
import type { ArchivedRoom } from '@/types/admin-quote';

/**
 * The rooms the client cleared from the chat ("Ricomincia chat di …"). They are out of the client's
 * card and of the editable draft; a quote already with the team keeps their lines (D8), so the team
 * knows the client dropped them. Nothing when no room was cleared.
 */
export function ArchivedRooms({ rooms = [] }: { rooms?: readonly ArchivedRoom[] }) {
  if (rooms.length === 0) return null;
  return (
    <section
      aria-label="Stanze archiviate dal cliente"
      data-testid="archived-rooms"
      className="bg-surface shadow-1 rounded-2xl p-4 border border-line space-y-2"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-ink">Stanze archiviate dal cliente</h2>
      <p className="text-sm text-ink-muted">
        Il cliente ha cancellato la chat di queste stanze: sono fuori dalla scheda del cliente e dalla bozza
        modificabile. In un preventivo già dal team le loro righe restano.
      </p>
      <ul className="space-y-1 text-sm">
        {rooms.map((room) => (
          <li key={room.room_id}>
            <span className="font-medium text-ink">{room.label}</span>{' '}
            <span className="text-ink-muted">· archiviata il {formatDateTime(room.cleared_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
