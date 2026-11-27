import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ConfirmationUpdate, SectionState } from '@/types/confirmation';
import { ConfirmedRow } from './ConfirmedRow';
import { PROBLEM_HINT, buildDraft, reconcileDraft } from './draft';
import { MeasureField } from './MeasureField';
import { type SaveOrigin, choiceVoice, measurePending, measureVoice } from './pending';
import { ChoiceRowEditor, MeasureRowEditor } from './RowEditor';
import { NO_VALUE_LABEL, SOURCE_LABEL, capitalize, formatNumber } from './text';

interface ConfirmationSectionProps {
  section: SectionState;
  editable: boolean;
  /** What of this section is being saved, if anything: only that button says "Salvo…". */
  saving: SaveOrigin | null;
  /** A confirmation is in flight (this section or another): nothing else is sent meanwhile. */
  locked: boolean;
  /** `voice`: the summary voice saved on its own; `null`: what is still to complete, together. */
  onConfirm: (update: ConfirmationUpdate, voice: string | null) => void;
  /** The summary voice of this section being changed, if any. */
  editingVoice: string | null;
  /** Some voice (of this or another section) is open: no other one can be opened. */
  editingElsewhere: boolean;
  /** The voice just closed: its "Modifica" gets the focus back. */
  restoreVoice: string | null;
  onRestored: () => void;
  onEdit: (voice: string) => void;
  onCancelEdit: () => void;
}

/** The fields still to complete, as the client left them, and the server values they were reconciled with. */
interface Fields {
  from: string;
  values: Record<string, string>;
  touched: ReadonlySet<string>;
}

const OPEN_EDIT_HINT = 'Chiudi prima la modifica aperta.';

/**
 * One quote section (a room), as the summary of the request (card-recap flow, U3). On top, under
 * "Da completare", the measures the client has to answer (missing, in conflict, a new value from the
 * chat, a photo reading or SYD's estimate), all together under one "Conferma". Below, the summary:
 * what the client said, what the code computed and the element choices, each with where it comes
 * from and its own "Modifica", that opens only that voice. When the card is read again the fields
 * follow the server, except the ones the client touched: what they are typing is never lost.
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
  const pendingId = useId();
  const measures = section.measures.filter(measurePending);
  const summary = section.measures.filter((m) => !measurePending(m));
  const serverValues = Object.fromEntries(measures.map((m) => [m.name, m.value === null ? '' : String(m.value)]));
  const from = JSON.stringify(serverValues);
  const [stored, setStored] = useState<Fields>(() => ({ from, values: serverValues, touched: new Set() }));
  // New server values: reconciled during render, not in an effect (no frame with stale fields).
  let fields = stored;
  if (stored.from !== from) {
    fields = {
      from,
      values: reconcileDraft(stored.values, stored.touched, serverValues),
      touched: new Set([...stored.touched].filter((name) => name in serverValues)),
    };
    setStored(fields);
  }
  // A field the server just dropped stays dropped.
  const setValue = (name: string, value: string) =>
    setStored((current) =>
      name in current.values
        ? { ...current, values: { ...current.values, [name]: value }, touched: new Set(current.touched).add(name) }
        : current,
    );

  const draft = buildDraft(measures, [], fields.values, {});
  const disabled = !editable || locked;
  const hasPending = measures.length > 0;
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
      {hasPending && (
        <div role="group" aria-labelledby={pendingId} className="space-y-3">
          <p id={pendingId} className="text-sm font-semibold text-warning-ink">
            Da completare
          </p>
          {measures.map((measure) => (
            <MeasureField
              key={measureVoice(measure.name)}
              measure={measure}
              value={fields.values[measure.name]}
              disabled={disabled}
              onChange={(value) => setValue(measure.name, value)}
            />
          ))}
          {editable && (
            <>
              {/* Nothing is sent on Enter: only the button confirms. */}
              <Button
                type="button"
                size="sm"
                className="h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary md:h-9"
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
      )}
      {summary.map((measure) => {
        const voice = measureVoice(measure.name);
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
            // "confermata" says nothing more than the row itself: only the other sources are named.
            note={measure.source !== null && measure.source !== 'confirmed' ? SOURCE_LABEL[measure.source] : undefined}
            {...rowProps(voice)}
          />
        );
      })}
      {section.element_choices.map((choice) => {
        const voice = choiceVoice(choice.element);
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
    </div>
  );
}
