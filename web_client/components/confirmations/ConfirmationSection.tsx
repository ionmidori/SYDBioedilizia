import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ConfirmationUpdate, ElementAction, SectionState } from '@/types/confirmation';
import { ConfirmedRow } from './ConfirmedRow';
import { PROBLEM_HINT, buildDraft } from './draft';
import { ElementChoiceField } from './ElementChoiceField';
import { MeasureField } from './MeasureField';
import { choicePending, choiceVoice, measurePending, measureVoice } from './pending';
import { ChoiceRowEditor, MeasureRowEditor } from './RowEditor';
import { NO_VALUE_LABEL, capitalize, formatNumber } from './text';

interface ConfirmationSectionProps {
  section: SectionState;
  editable: boolean;
  /** This section is being saved. */
  saving: boolean;
  /** A confirmation is in flight (this section or another): nothing else is sent meanwhile. */
  locked: boolean;
  onConfirm: (update: ConfirmationUpdate) => void;
  /** The confirmed voice of this section being changed, if any. */
  editingVoice: string | null;
  /** Some voice (of this or another section) is open: no other one can be opened. */
  editingElsewhere: boolean;
  /** The voice just closed: its "Modifica" gets the focus back. */
  restoreVoice: string | null;
  onRestored: () => void;
  onEdit: (voice: string) => void;
  onCancelEdit: () => void;
}

/**
 * One quote section (a room). What the client has still to confirm is a field, all together under
 * one "Conferma"; what is already confirmed is a summary row with its own "Modifica", that opens
 * only that voice. Its state lives here; the card remounts it when the server values change.
 */
export function ConfirmationSection({
  section,
  editable,
  saving,
  locked,
  onConfirm,
  editingVoice,
  editingElsewhere,
  restoreVoice,
  onRestored,
  onEdit,
  onCancelEdit,
}: ConfirmationSectionProps) {
  const measures = section.measures.filter(measurePending);
  const choices = section.element_choices.filter(choicePending);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(measures.map((m) => [m.name, m.value === null ? '' : String(m.value)])),
  );
  const [actions, setActions] = useState<Record<string, ElementAction>>(() =>
    Object.fromEntries(choices.map((c) => [c.element, c.action])),
  );
  const draft = buildDraft(measures, choices, values, actions);
  const disabled = !editable || locked;
  const hasPending = measures.length + choices.length > 0;
  const rowProps = (voice: string) => ({
    canEdit: editable,
    disabled: locked || editingElsewhere,
    restoreFocus: restoreVoice === voice,
    onRestored,
    onEdit: () => onEdit(voice),
  });

  return (
    <div className="space-y-3">
      {section.label !== null && (
        <h3 className="text-xs font-bold uppercase tracking-widest text-accent-ink">{section.label}</h3>
      )}
      {section.measures.map((measure) => {
        const voice = measureVoice(measure.name);
        if (measurePending(measure)) {
          return (
            <MeasureField
              key={voice}
              measure={measure}
              value={values[measure.name]}
              disabled={disabled}
              onChange={(value) => setValues((current) => ({ ...current, [measure.name]: value }))}
            />
          );
        }
        return editingVoice === voice ? (
          <MeasureRowEditor
            key={voice}
            voice={measure}
            saving={saving}
            locked={locked}
            onSave={onConfirm}
            onCancel={onCancelEdit}
          />
        ) : (
          <ConfirmedRow
            key={voice}
            label={capitalize(measure.label)}
            value={measure.value === null ? NO_VALUE_LABEL : formatNumber(measure.value)}
            {...rowProps(voice)}
          />
        );
      })}
      {section.element_choices.map((choice) => {
        const voice = choiceVoice(choice.element);
        if (choicePending(choice)) {
          return (
            <ElementChoiceField
              key={voice}
              choice={choice}
              value={actions[choice.element]}
              disabled={disabled}
              onChange={(action) => setActions((current) => ({ ...current, [choice.element]: action }))}
            />
          );
        }
        const chosen = choice.options.find(({ action }) => action === choice.action)?.label ?? choice.action;
        return editingVoice === voice ? (
          <ChoiceRowEditor
            key={voice}
            voice={choice}
            saving={saving}
            locked={locked}
            onSave={onConfirm}
            onCancel={onCancelEdit}
          />
        ) : (
          <ConfirmedRow key={voice} label={choice.label} value={capitalize(chosen)} {...rowProps(voice)} />
        );
      })}
      {editable && hasPending && (
        <>
          {/* Nothing is sent on Enter: only the button confirms. */}
          <Button
            type="button"
            size="sm"
            className="h-11 md:h-9"
            disabled={!('update' in draft) || locked || editingElsewhere}
            onClick={() => 'update' in draft && !disabled && !editingElsewhere && onConfirm(draft.update)}
          >
            {saving ? 'Salvo…' : 'Conferma'}
          </Button>
          {'problem' in draft && <p className="text-xs text-ink-muted">{PROBLEM_HINT[draft.problem]}</p>}
          {editingElsewhere && <p className="text-xs text-ink-muted">Chiudi prima la modifica aperta.</p>}
        </>
      )}
    </div>
  );
}
