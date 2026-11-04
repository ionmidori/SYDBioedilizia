import { renderHook, waitFor } from '@testing-library/react';
import { useMetadataEditor } from '../useMetadataEditor';

const fetchMock = jest.fn();
jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: (...args: unknown[]) => fetchMock(...args),
}));

const request = { projectId: 'p1', filePath: 'renders/a.png', room: 'cucina', status: 'final' };

beforeEach(() => {
    fetchMock.mockReset();
});

describe('useMetadataEditor', () => {
    it('POSTs the snake_case payload through the authenticated client and the /api/py proxy', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({ success: true, file_path: request.filePath, updated_metadata: {} }),
        });
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(true);

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/py/update-file-metadata',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    it('surfaces the message of an AppException error body', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 403,
            json: () =>
                Promise.resolve({
                    error_code: 'PERMISSION_DENIED',
                    message: "You don't have permission to edit this file",
                    detail: {},
                }),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(false);

        await waitFor(() =>
            expect(result.current.error).toBe("You don't have permission to edit this file")
        );
        errorSpy.mockRestore();
    });

    it('surfaces the message of a validation error (422, main.py handler shape)', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 422,
            json: () =>
                Promise.resolve({
                    error_code: 'VALIDATION_ERROR',
                    message: 'Request validation failed.',
                    detail: { errors: [{ loc: ['body', 'room'], msg: 'Input should be ...' }] },
                }),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(false);

        await waitFor(() => expect(result.current.error).toBe('Request validation failed.'));
        errorSpy.mockRestore();
    });

    it('falls back to the HTTP status when no message is a string', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 502,
            json: () => Promise.resolve({ detail: { reason: 'upstream' } }),
        });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useMetadataEditor());
        await expect(result.current.updateMetadata(request)).resolves.toBe(false);

        await waitFor(() => expect(result.current.error).toBe('HTTP 502'));
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
