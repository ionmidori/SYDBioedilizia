import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  type ConfirmationUpdate,
  type ElementAction,
  type SectionState,
  confirmationUpdateSchema,
} from '@/types/confirmation';
import { ElementChoiceField } from './ElementChoiceField';
import { MeasureField } from './MeasureField';

interface ConfirmationSectionProps {
  section: SectionState;
  editable: boolean;
  saving: boolean;
  onConfirm: (update: ConfirmationUpdate) => void;
}

/**
 * The update the client is about to confirm: every measure and every choice of the section.
 * `null` while a measure is empty or the backend would refuse the body (types/confirmation.ts).
 */
function buildUpdate(
  section: SectionState,
  values: Record<string, string>,
  actions: Record<string, ElementAction>,
): ConfirmationUpdate | null {
  const typed = section.measures.map((measure) => ({
    name: measure.name,
    text: values[measure.name].trim(),
  }));
  if (typed.some(({ text }) => text === '')) return null;
  const parsed = confirmationUpdateSchema.safeParse({
    measures: typed.map(({ name, text }) => ({ name, value: Number(text) })),
    element_choices: section.element_choices.map(({ element }) => ({
      element,
      action: actions[element],
    })),
  });
  return parsed.success ? parsed.data : null;
}

/** One quote section (a room) to confirm. Its state lives here; the card remounts it when the server values change. */
export function ConfirmationSection({ section, editable, saving, onConfirm }: ConfirmationSectionProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(section.measures.map((m) => [m.name, m.value === null ? '' : String(m.value)])),
  );
  const [actions, setActions] = useState<Record<string, ElementAction>>(() =>
    Object.fromEntries(section.element_choices.map((c) => [c.element, c.action])),
  );
  const update = buildUpdate(section, values, actions);
  const disabled = !editable || saving;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update && !disabled) onConfirm(update);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {section.label !== null && (
        <h3 className="text-xs font-bold uppercase tracking-widest text-accent-ink">{section.label}</h3>
      )}
      {section.measures.map((measure) => (
        <MeasureField
          key={measure.name}
          measure={measure}
          value={values[measure.name]}
          disabled={disabled}
          onChange={(value) => setValues((current) => ({ ...current, [measure.name]: value }))}
        />
      ))}
      {section.element_choices.map((choice) => (
        <ElementChoiceField
          key={choice.element}
          choice={choice}
          value={actions[choice.element]}
          disabled={disabled}
          onChange={(action) => setActions((current) => ({ ...current, [choice.element]: action }))}
        />
      ))}
      {editable && (
        <>
          <Button type="submit" size="sm" disabled={update === null || saving}>
            {saving ? 'Salvo…' : 'Conferma'}
          </Button>
          {update === null && <p className="text-xs text-ink-muted">Indica tutte le misure per confermare.</p>}
        </>
      )}
    </form>
  );
}
