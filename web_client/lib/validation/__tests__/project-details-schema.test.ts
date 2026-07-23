import { addressSchema, projectDetailsSchema } from '../project-details-schema';

const validAddress = { street: 'Via Roma 1', city: 'Roma', zip: '00100' };

const validDetails = {
    id: 'proj-1',
    footage_sqm: 85,
    property_type: 'apartment' as const,
    address: validAddress,
    budget_cap: 40000,
    renovation_constraints: ['vincolo storico'],
};

describe('addressSchema', () => {
    it('accepts a complete address', () => {
        expect(addressSchema.safeParse(validAddress).success).toBe(true);
    });

    it.each([
        ['an empty street', { street: '' }],
        ['an empty city', { city: '' }],
        ['an empty zip', { zip: '' }],
        ['a zip over 20 chars', { zip: '0'.repeat(21) }],
    ])('rejects %s', (_label, override) => {
        expect(addressSchema.safeParse({ ...validAddress, ...override }).success).toBe(false);
    });
});

describe('projectDetailsSchema', () => {
    it('accepts complete details without optional notes', () => {
        expect(projectDetailsSchema.safeParse(validDetails).success).toBe(true);
    });

    it('accepts an empty constraints array', () => {
        expect(
            projectDetailsSchema.safeParse({ ...validDetails, renovation_constraints: [] }).success
        ).toBe(true);
    });

    it.each([
        ['a zero footage', { footage_sqm: 0 }],
        ['a negative footage', { footage_sqm: -5 }],
        ['a footage over 100000', { footage_sqm: 100001 }],
        ['a non-numeric footage', { footage_sqm: '85' }],
        ['an unknown property type', { property_type: 'castle' }],
        ['a zero budget', { budget_cap: 0 }],
        ['notes over 1000 chars', { technical_notes: 'a'.repeat(1001) }],
        ['a missing address field', { address: { street: 'Via Roma 1', city: 'Roma' } }],
    ])('rejects %s', (_label, override) => {
        expect(projectDetailsSchema.safeParse({ ...validDetails, ...override }).success).toBe(false);
    });

    it('surfaces the Italian message for a missing footage', () => {
        const { footage_sqm, ...rest } = validDetails;
        void footage_sqm;
        const result = projectDetailsSchema.safeParse(rest);
        expect(result.success).toBe(false);
        if (!result.success) {
            const messages = result.error.issues.map((i) => i.message);
            expect(messages).toContain('Inserisci la metratura');
        }
    });
});
