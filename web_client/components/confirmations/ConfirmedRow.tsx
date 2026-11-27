import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface ConfirmedRowProps {
  label: string;
  value: string;
  /** Where the value comes from (a measure the client did not confirm on the card): shown under it. */
  note?: string;
  /** The quote is still a draft: the voice can be changed. */
  canEdit: boolean;
  /** Something else is open or being saved. */
  disabled: boolean;
  /** The voice was just closed: its button gets the focus back. */
  restoreFocus: boolean;
  /** The focus was given back: it is not given again when the card is drawn anew. */
  onRestored: () => void;
  onEdit: () => void;
}

/** One voice of the summary: its value (and where it comes from), and a button to change just that. */
export function ConfirmedRow({
  label,
  value,
  note,
  canEdit,
  disabled,
  restoreFocus,
  onRestored,
  onEdit,
}: ConfirmedRowProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!restoreFocus) return;
    button.current?.focus();
    onRestored();
  }, [restoreFocus, onRestored]);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 text-ink-muted">
        {label}
        {note && <span className="block text-xs">{note}</span>}
      </span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums text-ink">{value}</span>
        {canEdit && (
          <Button
            ref={button}
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 md:h-9"
            disabled={disabled}
            aria-label={`Modifica ${label}`}
            onClick={onEdit}
          >
            Modifica
          </Button>
        )}
      </span>
    </div>
  );
}
