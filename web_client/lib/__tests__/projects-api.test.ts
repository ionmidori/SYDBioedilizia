import { fetchValidated, fetchWithAuth } from '@/lib/api-client';
import { projectListResponseSchema, projectSchema } from '@/lib/validation/project-list-schema';
import { projectsApi } from '../projects-api';

jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: jest.fn(),
    fetchValidated: jest.fn(),
    describeApiError: jest.requireActual('@/lib/api-client').describeApiError,
}));

const mockFetchWithAuth = fetchWithAuth as jest.Mock;
const mockFetchValidated = fetchValidated as jest.Mock;

function res(body: unknown, init: { ok?: boolean; jsonFails?: boolean } = {}) {
    return {
        ok: init.ok ?? true,
        json: init.jsonFails
            ? () => Promise.reject(new SyntaxError('not json'))
            : () => Promise.resolve(body),
    } as unknown as Response;
}

beforeEach(() => {
    mockFetchWithAuth.mockReset();
    mockFetchValidated.mockReset();
});

describe('projectsApi.listProjects', () => {
    it('delegates to fetchValidated with the list schema', async () => {
        mockFetchValidated.mockResolvedValue([]);
        await expect(projectsApi.listProjects()).resolves.toEqual([]);
        expect(mockFetchValidated).toHaveBeenCalledWith(
            expect.stringContaining('/projects'),
            projectListResponseSchema
        );
    });
});

describe('projectsApi.getProject', () => {
    it('returns the validated project', async () => {
        const project = { session_id: 's1' };
        mockFetchValidated.mockResolvedValue(project);
        await expect(projectsApi.getProject('s1')).resolves.toBe(project);
        expect(mockFetchValidated).toHaveBeenCalledWith(
            expect.stringContaining('/projects/s1'),
            projectSchema
        );
    });

    it('maps a 404 to null instead of throwing', async () => {
        mockFetchValidated.mockRejectedValue({ status: 404 });
        await expect(projectsApi.getProject('missing')).resolves.toBeNull();
    });

    it('wraps other errors in an Italian message', async () => {
        mockFetchValidated.mockRejectedValue({ status: 500, message: 'boom' });
        await expect(projectsApi.getProject('s1')).rejects.toThrow('boom');
    });

    it('never shows the raw App Check rejection to the user', async () => {
        mockFetchValidated.mockRejectedValue({
            status: 403, error_code: 'APP_CHECK_FAILED', message: 'Missing App Check token',
        });
        await expect(projectsApi.getProject('s1')).rejects.toThrow(/verifica di sicurezza/);
    });

    it('falls back to a generic message when the error carries none', async () => {
        mockFetchValidated.mockRejectedValue({});
        await expect(projectsApi.getProject('s1')).rejects.toThrow(
            'Errore nel recupero del progetto'
        );
    });
});

describe('projectsApi — no project to create, rename or delete (Phase 139)', () => {
    it('has no such calls: the user has one chat, chosen by the backend', () => {
        expect(projectsApi).not.toHaveProperty('createProject');
        expect(projectsApi).not.toHaveProperty('updateProject');
        expect(projectsApi).not.toHaveProperty('deleteProject');
    });
});

describe('projectsApi.addProjectFile', () => {
    const metadata = { file_id: 'f1', url: 'https://x/f.png', name: 'f.png', type: 'image', size: 1 };

    it('POSTs the file metadata', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}));
        await expect(projectsApi.addProjectFile('s1', metadata)).resolves.toBeUndefined();
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/projects/s1/files'),
            expect.objectContaining({ method: 'POST', body: JSON.stringify(metadata) })
        );
    });

    it('throws on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, { ok: false }));
        await expect(projectsApi.addProjectFile('s1', metadata)).rejects.toThrow(
            'Impossibile salvare i metadati del file'
        );
    });
});

describe('projectsApi.updateProjectDetails', () => {
    const details = {
        id: 's1', footage_sqm: 80, property_type: 'apartment' as const,
        address: { street: 'Via Roma 1', city: 'Roma', zip: '00100' },
        budget_cap: 30000, renovation_constraints: [],
    };

    it('PATCHes the details through fetchWithAuth (carries App Check)', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ success: true }));
        await projectsApi.updateProjectDetails('s1', details);
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringMatching(/\/projects\/s1\/details$/),
            expect.objectContaining({ method: 'PATCH', body: JSON.stringify(details) })
        );
    });

    it('throws the backend message on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ message: 'Progetto non trovato' }, { ok: false }));
        await expect(projectsApi.updateProjectDetails('s1', details)).rejects.toThrow('Progetto non trovato');
    });
});
