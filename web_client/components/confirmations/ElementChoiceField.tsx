import { useId } from 'react';
import type { ElementAction, ElementChoiceState } from '@/types/confirmation';

const ACTION_LABEL: Record<ElementAction, string> = {
  replace: 'Sostituisci',
  reuse: 'Riutilizza',
  keep: 'Mantieni',
};

interface ElementChoiceFieldProps {
  choice: ElementChoiceState;
  value: ElementAction;
  disabled: boolean;
  onChange: (action: ElementAction) => void;
}

/** What to do with an existing element: one of the actions the library allows, as a segmented control. */
export function ElementChoiceField({ choice, value, disabled, onChange }: ElementChoiceFieldProps) {
  const groupId = useId();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span id={`${groupId}-label`} className="min-w-0 text-sm font-medium text-ink">
        {choice.label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="inline-flex rounded-xl border border-line-strong bg-surface p-0.5"
      >
        {choice.options.map((action) => (
          <label key={action} className="relative cursor-pointer">
            <input
              type="radio"
              name={groupId}
              value={action}
              checked={value === action}
              disabled={disabled}
              onChange={() => onChange(action)}
              className="peer sr-only"
            />
            <span className="block min-h-11 rounded-[10px] px-3 py-3 md:min-h-9 md:py-2 text-xs font-medium text-ink-muted transition-colors peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-60">
              {ACTION_LABEL[action]}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
