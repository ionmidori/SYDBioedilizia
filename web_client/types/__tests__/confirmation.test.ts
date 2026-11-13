import {
  confirmationResultSchema,
  confirmationStateSchema,
  confirmationUpdateSchema,
} from '../confirmation';
import { priceEstimateSchema, quoteRevisionSchema } from '../quote';

// What GET /api/projects/{id}/confirmations returns (ConfirmationState.model_dump(mode="json")).
const STATE = {
  sections: [
    {
      section_key: 'bagno1',
      label: 'Bagno',
      pending: true,
      measures: [
        {
          name: 'mq',
          label: 'Superficie pavimento',
          value: 6,
          source: 'estimated',
          proposed: null,
          candidates: [5.5, 6],
        },
        {
          name: 'mq_pareti',
          label: 'Superficie pareti',
          value: null,
          source: null,
          proposed: null,
          candidates: [],
        },
      ],
      element_choices: [
        {
          element: 'vasca',
          label: 'Vasca',
          action: 'replace',
          confirmed: false,
          options: [
            { action: 'replace', label: 'sostituisci' },
            { action: 'reuse', label: 'riutilizza' },
            { action: 'keep', label: 'lascia in posa' },
          ],
        },
      ],
    },
    { section_key: 'chat', label: null, pending: false, measures: [], element_choices: [] },
  ],
  editable: true,
  precision: null,
};

describe('confirmation schemas (Golden Sync with schemas/confirmation.py)', () => {
  it('accepts the state as the backend returns it', () => {
    expect(confirmationStateSchema.parse(STATE)).toEqual(STATE);
  });

  it('accepts the result of a confirmation', () => {
    const result = { recalculated: false, blocked_sections: ['cucina1'], state: { ...STATE, precision: 85 } };
    expect(confirmationResultSchema.parse(result)).toEqual(result);
  });

  it.each([
    ['an unknown measure source', { source: 'guess' }],
    ['a value that is not a number', { value: '6' }],
  ])('rejects a measure with %s', (_label, patch) => {
    const section = { ...STATE.sections[0], measures: [{ ...STATE.sections[0].measures[0], ...patch }] };
    expect(confirmationStateSchema.safeParse({ ...STATE, sections: [section] }).success).toBe(false);
  });

  it('rejects an unknown element action', () => {
    const choice = { ...STATE.sections[0].element_choices[0], action: 'paint' };
    const section = { ...STATE.sections[0], element_choices: [choice] };
    expect(confirmationStateSchema.safeParse({ ...STATE, sections: [section] }).success).toBe(false);
  });

  it('builds the body of a confirmation', () => {
    const body = { measures: [{ name: 'mq', value: 6 }], element_choices: [{ element: 'vasca', action: 'keep' }] };
    expect(confirmationUpdateSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['nothing to confirm', {}],
    ['a value over 10 000', { measures: [{ name: 'mq', value: 10_001 }] }],
    ['a measure twice', { measures: [{ name: 'mq', value: 6 }, { name: 'mq', value: 7 }] }],
    ['an unknown field', { measures: [{ name: 'mq', value: 6 }], price: 10 }],
    [
      'more than 32 choices',
      { element_choices: Array.from({ length: 33 }, (_, i) => ({ element: `e${i}`, action: 'keep' })) },
    ],
  ])('rejects a body with %s', (_label, body) => {
    expect(confirmationUpdateSchema.safeParse(body).success).toBe(false);
  });
});

describe('price estimate (Golden Sync with schemas/price_range.py)', () => {
  const FULL = { low: 1100, high: 1400, precision: 90, policy_version: '1.0.0' };

  it('reads the range the team sees', () => {
    expect(priceEstimateSchema.parse(FULL)).toEqual(FULL);
  });

  it('reads the precision only, as the client gets it', () => {
    expect(priceEstimateSchema.parse({ precision: 90 })).toEqual({ precision: 90 });
  });

  it('keeps the range of a revision', () => {
    const revision = quoteRevisionSchema.parse({ version: 1, actor_kind: 'ai', estimate: FULL });
    expect(revision.estimate).toEqual(FULL);
  });
});
