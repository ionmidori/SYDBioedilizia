import type { ElementChoiceState, MeasureState, SectionState } from '@/types/confirmation';

/** Same rule as the backend's `_section_state`: what the client still has to confirm. */
export const measurePending = (measure: MeasureState) => measure.source !== 'confirmed' || measure.proposed !== null;
export const choicePending = (choice: ElementChoiceState) => !choice.confirmed;

/** Identifies one voice (a measure or an element choice) inside a section. */
export const measureVoice = (name: string) => `measure:${name}`;
export const choiceVoice = (element: string) => `choice:${element}`;

/** The voice exists in the section and is confirmed: the only kind the client can open to change. */
export function voiceConfirmed(section: SectionState, voice: string): boolean {
  const measure = section.measures.find((m) => measureVoice(m.name) === voice);
  if (measure) return !measurePending(measure);
  const choice = section.element_choices.find((c) => choiceVoice(c.element) === voice);
  return choice !== undefined && !choicePending(choice);
}
