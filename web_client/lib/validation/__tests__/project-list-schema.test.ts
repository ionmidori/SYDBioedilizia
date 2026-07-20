import {
    projectListItemSchema,
    projectListResponseSchema,
    projectSchema,
} from '../project-list-schema';

const item = {
    session_id: 'sess-1',
    title: 'Ristrutturazione bagno',
    status: 'quoted',
    thumbnail_url: 'https://storage.googleapis.com/b/t.png?X-Goog-Signature=abc',
    original_image_url: null,
    updated_at: '2026-07-20T10:00:00Z',
    message_count: 4,
    has_quote: true,
};

describe('projectListItemSchema', () => {
    it('accepts a full backend payload', () => {
        expect(projectListItemSchema.safeParse(item).success).toBe(true);
    });

    it('normalises a null url to undefined (wire null -> UI undefined)', () => {
        const result = projectListItemSchema.safeParse(item);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.original_image_url).toBeUndefined();
    });

    it('defaults message_count and has_quote when the backend omits them', () => {
        const { message_count, has_quote, ...partial } = item;
        void message_count;
        void has_quote;
        const result = projectListItemSchema.safeParse(partial);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.message_count).toBe(0);
            expect(result.data.has_quote).toBe(false);
        }
    });

    it('rejects an unknown status (schema drift guard)', () => {
        expect(projectListItemSchema.safeParse({ ...item, status: 'archived' }).success).toBe(false);
    });

    it('rejects a naive datetime without offset', () => {
        expect(
            projectListItemSchema.safeParse({ ...item, updated_at: '2026-07-20T10:00:00' }).success
        ).toBe(false);
    });

    it('rejects an empty session_id', () => {
        expect(projectListItemSchema.safeParse({ ...item, session_id: '' }).success).toBe(false);
    });

    it('rejects a fractional message_count', () => {
        expect(projectListItemSchema.safeParse({ ...item, message_count: 1.5 }).success).toBe(false);
    });
});

describe('projectListResponseSchema', () => {
    it('accepts an empty array', () => {
        expect(projectListResponseSchema.safeParse([]).success).toBe(true);
    });

    it('fails the whole response if a single item is malformed', () => {
        expect(projectListResponseSchema.safeParse([item, { ...item, status: 'nope' }]).success).toBe(
            false
        );
    });
});

describe('projectSchema', () => {
    const full = {
        ...item,
        user_id: 'uid-1',
        created_at: '2026-07-01T08:00:00Z',
        construction_details: null,
    };

    it('accepts the extended project payload', () => {
        expect(projectSchema.safeParse(full).success).toBe(true);
    });

    it('normalises null construction_details to undefined', () => {
        const result = projectSchema.safeParse(full);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.construction_details).toBeUndefined();
    });

    it('requires user_id', () => {
        const { user_id, ...withoutUser } = full;
        void user_id;
        expect(projectSchema.safeParse(withoutUser).success).toBe(false);
    });
});
