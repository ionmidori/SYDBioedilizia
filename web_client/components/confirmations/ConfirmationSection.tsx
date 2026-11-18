import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ConfirmationUpdate, ElementAction, SectionState } from '@/types/confirmation';
import { ConfirmedRow } from './ConfirmedRow';
import { PROBLEM_HINT, buildDraft, reconcileDraft } from './draft';
import { ElementChoiceField } from './ElementChoiceField';
import { MeasureField } from './MeasureField';
import { type SaveOrigin, choicePending, choiceVoice, measurePending, measureVoice } from './pending';
import { ChoiceRowEditor, MeasureRowEditor } from './RowEditor';
import { NO_VALUE_LABEL, capitalize, formatNumber } from './text';

interface ConfirmationSectionProps {
  section: SectionState;
  editable: boolean;
  /** What of this section is being saved, if anything: only that button says "Salvo…". */
  saving: SaveOrigin | null;
  /** A confirmation is in flight (this section or another): nothing else is sent meanwhile. */
  locked: boolean;
  /** `voice`: the confirmed voice saved on its own; `null`: what is still to confirm, together. */
  onConfirm: (update: ConfirmationUpdate, voice: string | null) => void;
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

/** The fields still to confirm, as the client left them, and the server values they were reconciled with. */
interface Fields {
  from: string;
  values: Record<string, string>;
  actions: Record<string, ElementAction>;
  touchedValues: ReadonlySet<string>;
  touchedActions: ReadonlySet<string>;
}

const OPEN_EDIT_HINT = 'Chiudi prima la modifica aperta.';

/**
 * One quote section (a room). What the client has still to confirm is a field, all together under
 * one "Conferma"; what is already confirmed is a summary row with its own "Modifica", that opens
 * only that voice. When the card is read again the fields follow the server, except the ones the
 * client touched: what they are typing is never lost.
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
  const hintId = useId();
  const measures = section.measures.filter(measurePending);
  const choices = section.element_choices.filter(choicePending);
  const serverValues = Object.fromEntries(measures.map((m) => [m.name, m.value === null ? '' : String(m.value)]));
  const serverActions = Object.fromEntries(choices.map((c) => [c.element, c.action]));
  const from = JSON.stringify([serverValues, serverActions]);
  const [stored, setStored] = useState<Fields>(() => ({
    from,
    values: serverValues,
    actions: serverActions,
    touchedValues: new Set(),
    touchedActions: new Set(),
  }));
  // New server values: reconciled during render, not in an effect (no frame with stale fields).
  let fields = stored;
  if (stored.from !== from) {
    fields = {
      from,
      values: reconcileDraft(stored.values, stored.touchedValues, serverValues),
      actions: reconcileDraft(stored.actions, stored.touchedActions, serverActions),
      touchedValues: new Set([...stored.touchedValues].filter((name) => name in serverValues)),
      touchedActions: new Set([...stored.touchedActions].filter((element) => element in serverActions)),
    };
    setStored(fields);
  }
  const setValue = (name: string, value: string) =>
    setStored((current) => ({
      ...current,
      values: { ...current.values, [name]: value },
      touchedValues: new Set(current.touchedValues).add(name),
    }));
  const setAction = (element: string, action: ElementAction) =>
    setStored((current) => ({
      ...current,
      actions: { ...current.actions, [element]: action },
      touchedActions: new Set(current.touchedActions).add(element),
    }));

  const draft = buildDraft(measures, choices, fields.values, fields.actions);
  const disabled = !editable || locked;
  const hasPending = measures.length + choices.length > 0;
  const problem = 'problem' in draft ? PROBLEM_HINT[draft.problem] : null;
  // Not `disabled`: the button keeps the focus while it saves, and its hint is read with it.
  const unavailable = !('update' in draft) || locked || editingElsewhere;
  const hintIds = [problem && `${hintId}-problem`, editingElsewhere && `${hintId}-open`].filter(Boolean).join(' ');
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
              value={fields.values[measure.name]}
              disabled={disabled}
              onChange={(value) => setValue(measure.name, value)}
            />
          );
        }
        return editingVoice === voice ? (
          <MeasureRowEditor
            key={voice}
            voice={measure}
            saving={saving?.voice === voice}
            locked={locked}
            onSave={(update) => onConfirm(update, voice)}
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
              value={fields.actions[choice.element]}
              disabled={disabled}
              onChange={(action) => setAction(choice.element, action)}
            />
          );
        }
        const chosen = choice.options.find(({ action }) => action === choice.action)?.label ?? choice.action;
        return editingVoice === voice ? (
          <ChoiceRowEditor
            key={voice}
            voice={choice}
            saving={saving?.voice === voice}
            locked={locked}
            onSave={(update) => onConfirm(update, voice)}
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
            className="h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:h-9"
            aria-disabled={unavailable || undefined}
            aria-describedby={hintIds || undefined}
            onClick={() => !unavailable && 'update' in draft && onConfirm(draft.update, null)}
          >
            {saving?.voice === null ? 'Salvo…' : 'Conferma'}
          </Button>
          {problem && (
            <p id={`${hintId}-problem`} className="text-xs text-ink-muted">
              {problem}
            </p>
          )}
          {editingElsewhere && (
            <p id={`${hintId}-open`} className="text-xs text-ink-muted">
              {OPEN_EDIT_HINT}
            </p>
          )}
        </>
      )}
    </div>
  );
}
