import {
  type ConfirmationUpdate,
  type ElementAction,
  type ElementChoiceState,
  type MeasureState,
  MEASURE_MAX,
  confirmationUpdateSchema,
} from '@/types/confirmation';

/** What the client is about to confirm: the given measures and choices, or what is wrong with them. */
export type Draft = { update: ConfirmationUpdate } | { problem: 'empty' | 'range' };

export const PROBLEM_HINT = {
  empty: 'Indica tutte le misure per confermare.',
  range: `Ogni misura va da 0 a ${MEASURE_MAX.toLocaleString('it-IT')}.`,
} as const;

/** `values` holds the text of each measure (the client may be typing), `actions` the action of each choice. */
export function buildDraft(
  measures: readonly MeasureState[],
  choices: readonly ElementChoiceState[],
  values: Record<string, string>,
  actions: Record<string, ElementAction>,
): Draft {
  const typed = measures.map((measure) => ({ name: measure.name, text: values[measure.name].trim() }));
  if (typed.some(({ text }) => text === '')) return { problem: 'empty' };
  const parsed = confirmationUpdateSchema.safeParse({
    measures: typed.map(({ name, text }) => ({ name, value: Number(text) })),
    element_choices: choices.map(({ element }) => ({ element, action: actions[element] })),
  });
  // The schema is the backend's: what it refuses is a value out of range or a repeated name.
  return parsed.success ? { update: parsed.data } : { problem: 'range' };
}
