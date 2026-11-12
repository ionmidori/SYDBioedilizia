/**
 * Confirmation card — Golden Sync with backend_python/src/schemas/confirmation.py
 * (Phase 140, step 3).
 *
 * The client confirms, per quote section, the measures the lines are computed
 * from and what to do with each existing element. No amount ever: the card
 * shows the precision of the price range only.
 */
import { z } from 'zod';

// MeasureValue in schemas/intervention_spec.py.
const MEASURE_MAX = 10_000;
const measureValueSchema = z.number().min(0).max(MEASURE_MAX);
// _MAX_CHOICES in schemas/confirmation.py (the measures are checked by name there).
const MAX_CHOICES = 32;

export const measureSourceSchema = z.enum(['declared', 'photo', 'estimated', 'brief', 'confirmed']);
export type MeasureSource = z.infer<typeof measureSourceSchema>;

// ElementAction in schemas/assembly_library.py.
export const elementActionSchema = z.enum(['replace', 'reuse', 'keep']);
export type ElementAction = z.infer<typeof elementActionSchema>;

// ── What the card shows ──────────────────────────────────────────────────────

/** A measure of a section; `value` null: nobody gave it yet. */
export const measureStateSchema = z.object({
  name: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  source: measureSourceSchema.nullable(),
  // A new value from the model after the client confirmed this one.
  proposed: z.number().nullable().default(null),
  // The different values the model gave (quick picks).
  candidates: z.array(z.number()).default([]),
});
export type MeasureState = z.infer<typeof measureStateSchema>;

/** What happens to an existing element; `options` are the actions the library allows. */
export const elementChoiceStateSchema = z.object({
  element: z.string(),
  label: z.string(),
  action: elementActionSchema,
  confirmed: z.boolean(),
  options: z.array(elementActionSchema),
});
export type ElementChoiceState = z.infer<typeof elementChoiceStateSchema>;

/** One quote unit: a room, "generale", or "chat" (a project without rooms, `label` null). */
export const sectionStateSchema = z.object({
  section_key: z.string(),
  label: z.string().nullable(),
  // Something the client has not confirmed yet (a measure, a proposal, an element).
  pending: z.boolean(),
  measures: z.array(measureStateSchema),
  element_choices: z.array(elementChoiceStateSchema),
});
export type SectionState = z.infer<typeof sectionStateSchema>;

export const confirmationStateSchema = z.object({
  sections: z.array(sectionStateSchema),
  // The client can still change the quote: none yet, or a draft.
  editable: z.boolean(),
  // Precision of the draft's price range (0-100); null without a draft or a range.
  precision: z.number().int().min(0).max(100).nullable(),
});
export type ConfirmationState = z.infer<typeof confirmationStateSchema>;

export const confirmationResultSchema = z.object({
  // The draft was recomputed from the confirmed values (no model call).
  recalculated: z.boolean(),
  // Sections still missing a measure: the draft waits for them.
  blocked_sections: z.array(z.string()),
  state: confirmationStateSchema,
});
export type ConfirmationResult = z.infer<typeof confirmationResultSchema>;

// ── What the client confirms (PUT body) ──────────────────────────────────────

export const measureConfirmationSchema = z.strictObject({
  name: z.string().min(1),
  value: measureValueSchema,
});

export const choiceConfirmationSchema = z.strictObject({
  element: z.string().min(1).max(64),
  action: elementActionSchema,
});

const unique = (values: string[]) => new Set(values).size === values.length;

/** At least one measure or choice, each once (the backend checks the names). */
export const confirmationUpdateSchema = z
  .strictObject({
    measures: z.array(measureConfirmationSchema).default([]),
    element_choices: z.array(choiceConfirmationSchema).max(MAX_CHOICES).default([]),
  })
  .refine((u) => u.measures.length + u.element_choices.length > 0, 'nothing to confirm')
  .refine(
    (u) => unique(u.measures.map((m) => m.name)) && unique(u.element_choices.map((c) => c.element)),
    'a measure or an element confirmed twice',
  );
export type ConfirmationUpdate = z.infer<typeof confirmationUpdateSchema>;
