import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  type ConfirmationUpdate,
  type ElementAction,
  type SectionState,
  MEASURE_MAX,
  confirmationUpdateSchema,
} from '@/types/confirmation';
import { ElementChoiceField } from './ElementChoiceField';
import { MeasureField } from './MeasureField';

interface ConfirmationSectionProps {
  section: SectionState;
  editable: boolean;
  /** This section is being saved. */
  saving: boolean;
  /** A confirmation is in flight (this section or another): nothing else is sent meanwhile. */
  locked: boolean;
  onConfirm: (update: ConfirmationUpdate) => void;
}

/** What the client is about to confirm: every measure and every choice of the section, or what is wrong with it. */
type Draft = { update: ConfirmationUpdate } | { problem: 'empty' | 'range' };

const PROBLEM_HINT = {
  empty: 'Indica tutte le misure per confermare.',
  range: `Ogni misura va da 0 a ${MEASURE_MAX.toLocaleString('it-IT')}.`,
} as const;

function buildDraft(
  section: SectionState,
  values: Record<string, string>,
  actions: Record<string, ElementAction>,
): Draft {
  const typed = section.measures.map((measure) => ({
    name: measure.name,
    text: values[measure.name].trim(),
  }));
  if (typed.some(({ text }) => text === '')) return { problem: 'empty' };
  const parsed = confirmationUpdateSchema.safeParse({
    measures: typed.map(({ name, text }) => ({ name, value: Number(text) })),
    element_choices: section.element_choices.map(({ element }) => ({
      element,
      action: actions[element],
    })),
  });
  // The schema is the backend's: what it refuses is a value out of range or a repeated name.
  return parsed.success ? { update: parsed.data } : { problem: 'range' };
}

/** One quote section (a room) to confirm. Its state lives here; the card remounts it when the server values change. */
export function ConfirmationSection({ section, editable, saving, locked, onConfirm }: ConfirmationSectionProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(section.measures.map((m) => [m.name, m.value === null ? '' : String(m.value)])),
  );
  const [actions, setActions] = useState<Record<string, ElementAction>>(() =>
    Object.fromEntries(section.element_choices.map((c) => [c.element, c.action])),
  );
  const draft = buildDraft(section, values, actions);
  const disabled = !editable || locked;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if ('update' in draft && !disabled) onConfirm(draft.update);
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
          <Button type="submit" size="sm" className="h-11 md:h-9" disabled={!('update' in draft) || locked}>
            {saving ? 'Salvo…' : 'Conferma'}
          </Button>
          {'problem' in draft && <p className="text-xs text-ink-muted">{PROBLEM_HINT[draft.problem]}</p>}
        </>
      )}
    </form>
  );
}
