import { renderHook, waitFor } from '@testing-library/react';
import { useMetadataEditor } from '../useMetadataEditor';

const mockRefreshToken = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ refreshToken: mockRefreshToken }),
}));

const fetchMock = global.fetch as jest.Mock;

const request = { projectId: 'p1', filePath: 'renders/a.png', room: 'cucina', status: 'final' };

beforeEach(() => {
    fetchMock.mockReset();
    mockRefreshToken.mockReset().mockResolvedValue('tok-1');
});

describe('useMetadataEditor', () => {
    it('POSTs the snake_case payload with a fresh token', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({ success: true, file_path: request.filePath, updated_metadata: {} }),
        });
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(true);

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/update-file-metadata'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }),
                body: JSON.stringify({
                    project_id: 'p1',
                    file_path: 'renders/a.png',
                    room: 'cucina',
                    status: 'final',
                }),
            })
        );
        await waitFor(() => expect(result.current.isUpdating).toBe(false));
        expect(result.current.error).toBeNull();
        logSpy.mockRestore();
    });

    it('surfaces the backend detail on a non-ok response', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 403,
            json: () => Promise.resolve({ detail: 'Non autorizzato' }),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(false);

        await waitFor(() => expect(result.current.error).toBe('Non autorizzato'));
        errorSpy.mockRestore();
    });

    it('falls back to the HTTP status when the error body is not JSON', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.reject(new SyntaxError('not json')),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(false);

        await waitFor(() => expect(result.current.error).toBe('Failed to update metadata'));
        errorSpy.mockRestore();
    });

    it('reports a network failure', async () => {
        fetchMock.mockRejectedValue(new Error('offline'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(false);

        await waitFor(() => expect(result.current.error).toBe('offline'));
        expect(result.current.isUpdating).toBe(false);
        errorSpy.mockRestore();
    });
});
