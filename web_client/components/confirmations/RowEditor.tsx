import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { ConfirmationUpdate, ElementAction, ElementChoiceState, MeasureState } from '@/types/confirmation';
import { PROBLEM_HINT, buildDraft } from './draft';
import { ElementChoiceField } from './ElementChoiceField';
import { MeasureField } from './MeasureField';
import { capitalize } from './text';

interface EditorFrameProps {
  children: ReactNode;
  /** The voice being changed: names the group, so two "Conferma" can be told apart. */
  label: string;
  canSave: boolean;
  saving: boolean;
  /** A confirmation is in flight. */
  locked: boolean;
  hint?: string;
  onSave: () => void;
  onCancel: () => void;
}

/** The field being changed with its own Conferma and Annulla. Nothing is sent on Enter: only the button saves. */
function EditorFrame({ children, label, canSave, saving, locked, hint, onSave, onCancel }: EditorFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  // Opened by the client: the focus goes to the field (the chosen action for a choice).
  useEffect(() => {
    const root = frame.current;
    (root?.querySelector<HTMLInputElement>('input:checked') ?? root?.querySelector<HTMLInputElement>('input'))?.focus();
  }, []);

  return (
    <div
      ref={frame}
      role="group"
      aria-label={`Modifica ${label}`}
      className="space-y-2 rounded-xl border border-line bg-surface p-3"
    >
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-11 md:h-9" disabled={!canSave || locked} onClick={onSave}>
          {saving ? 'Salvo…' : 'Conferma'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-11 md:h-9" disabled={locked} onClick={onCancel}>
          Annulla
        </Button>
      </div>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

interface RowEditorProps<T> {
  voice: T;
  saving: boolean;
  locked: boolean;
  onSave: (update: ConfirmationUpdate) => void;
  onCancel: () => void;
}

/** Changes one confirmed measure: only that measure goes to the backend. */
export function MeasureRowEditor({ voice: measure, saving, locked, onSave, onCancel }: RowEditorProps<MeasureState>) {
  const [value, setValue] = useState(measure.value === null ? '' : String(measure.value));
  const draft = buildDraft([measure], [], { [measure.name]: value }, {});

  return (
    <EditorFrame
      label={capitalize(measure.label)}
      canSave={'update' in draft}
      saving={saving}
      locked={locked}
      hint={'problem' in draft ? PROBLEM_HINT[draft.problem] : undefined}
      onSave={() => 'update' in draft && onSave(draft.update)}
      onCancel={onCancel}
    >
      <MeasureField measure={measure} value={value} disabled={locked} onChange={setValue} />
    </EditorFrame>
  );
}

/** Changes one confirmed element choice: only that choice goes to the backend. */
export function ChoiceRowEditor({ voice: choice, saving, locked, onSave, onCancel }: RowEditorProps<ElementChoiceState>) {
  const [action, setAction] = useState<ElementAction>(choice.action);
  const draft = buildDraft([], [choice], {}, { [choice.element]: action });

  return (
    <EditorFrame
      label={choice.label}
      canSave={'update' in draft}
      saving={saving}
      locked={locked}
      onSave={() => 'update' in draft && onSave(draft.update)}
      onCancel={onCancel}
    >
      <ElementChoiceField choice={choice} value={action} disabled={locked} onChange={setAction} />
    </EditorFrame>
  );
}
