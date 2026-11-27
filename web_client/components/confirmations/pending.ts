import type { MeasureSource, MeasureState, SectionState } from '@/types/confirmation';

/** Values nobody gave: a photo reading, SYD's estimate. The client confirms them on the card. */
const SOURCES_TO_CONFIRM: ReadonlySet<MeasureSource> = new Set(['photo', 'estimated']);

/**
 * Same rule as the backend's `measure_needs_answer` (spec_confirmation.py): the card asks a measure
 * only when it is missing, in conflict, has a new value from the chat, or comes from a photo or
 * SYD's estimate. What the client said, the room brief and the code's calculation are accepted
 * (decision U3, 27 Nov): a summary row with "Modifica". The element choices are always a summary.
 */
export const measurePending = (measure: MeasureState) =>
  measure.value === null ||
  measure.candidates.length > 0 ||
  measure.proposed !== null ||
  (measure.source !== null && SOURCES_TO_CONFIRM.has(measure.source));

/** Identifies one voice (a measure or an element choice) inside a section. */
export const measureVoice = (name: string) => `measure:${name}`;
export const choiceVoice = (element: string) => `choice:${element}`;

/** What is being saved: a section, through one summary voice or (`null`) its group "Conferma". */
export interface SaveOrigin {
  section: string;
  voice: string | null;
}

/** The voice exists in the section and is a summary row: the only kind the client can open to change. */
export function voiceConfirmed(section: SectionState, voice: string): boolean {
  const measure = section.measures.find((m) => measureVoice(m.name) === voice);
  if (measure) return !measurePending(measure);
  return section.element_choices.some((c) => choiceVoice(c.element) === voice);
}
