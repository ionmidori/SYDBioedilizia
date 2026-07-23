import { fetchValidated, fetchWithAuth } from '@/lib/api-client';
import { projectListResponseSchema, projectSchema } from '@/lib/validation/project-list-schema';
import { projectsApi } from '../projects-api';

jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: jest.fn(),
    fetchValidated: jest.fn(),
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

    it('falls back to a generic message when the error carries none', async () => {
        mockFetchValidated.mockRejectedValue({});
        await expect(projectsApi.getProject('s1')).rejects.toThrow(
            'Errore nel recupero del progetto'
        );
    });
});

describe('projectsApi.createProject', () => {
    it('POSTs the payload and returns the session id', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ session_id: 'new-1' }));
        await expect(projectsApi.createProject({ title: 'Bagno' })).resolves.toEqual({
            session_id: 'new-1',
        });
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/projects'),
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Bagno' }) })
        );
    });

    it('surfaces the backend detail on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ detail: 'Quota esaurita' }, { ok: false }));
        await expect(projectsApi.createProject()).rejects.toThrow('Quota esaurita');
    });

    it('keeps the generic message when the error body is not JSON', async () => {
        mockFetchWithAuth.mockResolvedValue(res(null, { ok: false, jsonFails: true }));
        await expect(projectsApi.createProject()).rejects.toThrow('Impossibile creare il progetto');
    });
});

describe('projectsApi.updateProject', () => {
    it('PATCHes the project', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}));
        await expect(projectsApi.updateProject('s1', { title: 'Nuovo' })).resolves.toBeUndefined();
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/projects/s1'),
            expect.objectContaining({ method: 'PATCH' })
        );
    });

    it('throws on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, { ok: false }));
        await expect(projectsApi.updateProject('s1', {})).rejects.toThrow(
            'Impossibile aggiornare il progetto'
        );
    });
});

describe('projectsApi.claimProject', () => {
    it('POSTs the claim and returns the body', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ claimed: true }));
        await expect(projectsApi.claimProject('s1')).resolves.toEqual({ claimed: true });
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/projects/s1/claim'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('surfaces the backend detail on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ detail: 'Già reclamato' }, { ok: false }));
        await expect(projectsApi.claimProject('s1')).rejects.toThrow('Già reclamato');
    });
});

describe('projectsApi.deleteProject', () => {
    it('DELETEs the project', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}));
        await expect(projectsApi.deleteProject('s1')).resolves.toBeUndefined();
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/projects/s1'),
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('throws on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, { ok: false }));
        await expect(projectsApi.deleteProject('s1')).rejects.toThrow(
            'Impossibile eliminare il progetto'
        );
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
