import { useId } from 'react';
import { MEASURE_MAX, type MeasureSource, type MeasureState } from '@/types/confirmation';
import { capitalize } from './text';

/** Where a value comes from, as the client reads it (`null` source: nobody gave it yet). */
const SOURCE_LABEL: Record<MeasureSource, string> = {
  declared: 'indicata da te',
  photo: 'dalle tue foto',
  estimated: 'stimata da SYD',
  brief: 'dalla tua descrizione',
  confirmed: 'confermata',
};
const NO_VALUE_LABEL = 'da indicare';

const formatNumber = (value: number) => value.toLocaleString('it-IT');

interface MeasureFieldProps {
  measure: MeasureState;
  /** What the input holds (text: the client may be typing). */
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/** One measure of a section: the value to confirm, where it comes from, quick picks for other values. */
export function MeasureField({ measure, value, disabled, onChange }: MeasureFieldProps) {
  const inputId = useId();
  const noteId = `${inputId}-note`;
  const { proposed, candidates } = measure;
  // The values the chat gave besides the one in the input: one tap to take them.
  const picks = [...new Set([...(proposed === null ? [] : [proposed]), ...candidates])].filter(
    (pick) => String(pick) !== value,
  );

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={inputId} className="min-w-0 text-sm font-medium text-ink">
          {capitalize(measure.label)}
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          max={MEASURE_MAX}
          aria-describedby={noteId}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-28 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-right text-base tabular-nums text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm"
        />
      </div>
      <p id={noteId} className="text-xs text-ink-muted">
        {measure.source === null ? NO_VALUE_LABEL : SOURCE_LABEL[measure.source]}
        {proposed !== null && (
          <span className="block text-warning-ink">Nuova indicazione dalla chat: {formatNumber(proposed)}</span>
        )}
      </p>
      {!disabled && picks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picks.map((pick) => (
            <button
              key={pick}
              type="button"
              onClick={() => onChange(String(pick))}
              className="min-h-11 cursor-pointer rounded-lg md:min-h-9 border border-line bg-surface px-3 text-xs font-medium text-primary-ink transition-colors hover:bg-surface-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              Usa {formatNumber(pick)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
