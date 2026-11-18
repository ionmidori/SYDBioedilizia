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

/**
 * The fields of a section after the server sent new values (the card is read again): what the
 * client touched stays as typed, the rest takes the server value, what the server no longer asks
 * for goes away.
 */
export function reconcileDraft<T>(
  local: Readonly<Record<string, T>>,
  touched: ReadonlySet<string>,
  server: Readonly<Record<string, T>>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(server).map(([key, value]) => [key, touched.has(key) && key in local ? local[key] : value]),
  );
}

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
