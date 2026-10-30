import { projectSchema } from '../project-schema';

// GET /api/projects/{id} — Golden Sync with ProjectDocument (models/project.py).
const project = {
    session_id: 'sess-1',
    title: 'Nuovo Progetto',
    user_id: 'uid-1',
    status: 'quoted',
    thumbnail_url: 'https://storage.googleapis.com/b/t.png?X-Goog-Signature=abc',
    original_image_url: null,
    message_count: 4,
    created_at: '2026-07-01T08:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    construction_details: null,
};

describe('projectSchema', () => {
    it('accepts a full backend payload', () => {
        expect(projectSchema.safeParse(project).success).toBe(true);
    });

    it('normalises a null url and null construction_details to undefined (wire null -> UI undefined)', () => {
        const result = projectSchema.safeParse(project);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.original_image_url).toBeUndefined();
            expect(result.data.construction_details).toBeUndefined();
        }
    });

    it('defaults message_count when the backend omits it', () => {
        const { message_count, ...partial } = project;
        void message_count;
        const result = projectSchema.safeParse(partial);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.message_count).toBe(0);
    });

    it('carries none of the old list fields (Phase 139: no list of projects)', () => {
        const result = projectSchema.safeParse({ ...project, has_quote: true, quote_status: 'draft' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty('has_quote');
            expect(result.data).not.toHaveProperty('quote_status');
        }
    });

    it('rejects an unknown status (schema drift guard)', () => {
        expect(projectSchema.safeParse({ ...project, status: 'archived' }).success).toBe(false);
    });

    it('rejects a naive datetime without offset', () => {
        expect(projectSchema.safeParse({ ...project, updated_at: '2026-07-20T10:00:00' }).success).toBe(false);
    });

    it('rejects an empty session_id', () => {
        expect(projectSchema.safeParse({ ...project, session_id: '' }).success).toBe(false);
    });

    it('requires user_id', () => {
        const { user_id, ...withoutUser } = project;
        void user_id;
        expect(projectSchema.safeParse(withoutUser).success).toBe(false);
    });
});
