import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { ElementChoiceState, SectionState } from '@/types/confirmation';
import { capitalize, formatNumber } from './text';

interface ConfirmedSectionProps {
  section: SectionState;
  /** A confirmation is in flight: no section is opened meanwhile. */
  disabled: boolean;
  onEdit: () => void;
  /** The section was just closed: the focus comes back to its button. */
  restoreFocus?: boolean;
}

const NO_VALUE_LABEL = 'da indicare';

/** The action the client confirmed, in the words of the library ("lascia in posa"). */
const chosenLabel = (choice: ElementChoiceState) =>
  choice.options.find(({ action }) => action === choice.action)?.label ?? choice.action;

/** A section the client already confirmed: what was confirmed, closed, and a button to change it. */
export function ConfirmedSection({ section, disabled, onEdit, restoreFocus = false }: ConfirmedSectionProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (restoreFocus) button.current?.focus();
  }, [restoreFocus]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {section.label !== null ? (
          <h3 className="text-xs font-bold uppercase tracking-widest text-accent-ink">{section.label}</h3>
        ) : (
          <span />
        )}
        <Button
          ref={button}
          type="button"
          variant="secondary"
          size="sm"
          className="h-11 md:h-9"
          disabled={disabled}
          aria-label={section.label === null ? 'Modifica' : `Modifica ${section.label}`}
          onClick={onEdit}
        >
          Modifica
        </Button>
      </div>
      <dl className="space-y-1 text-sm">
        {section.measures.map((measure) => (
          <div key={measure.name} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-ink-muted">{capitalize(measure.label)}</dt>
            <dd className="tabular-nums text-ink">
              {measure.value === null ? NO_VALUE_LABEL : formatNumber(measure.value)}
            </dd>
          </div>
        ))}
        {section.element_choices.map((choice) => (
          <div key={choice.element} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-ink-muted">{choice.label}</dt>
            <dd className="text-ink">{capitalize(chosenLabel(choice))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
