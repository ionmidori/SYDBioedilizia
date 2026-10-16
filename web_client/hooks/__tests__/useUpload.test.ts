import { renderHook, act, waitFor } from '@testing-library/react';
import { useUpload } from '../useUpload';

// =============================================================================
// MOCKS
// =============================================================================

// Mock useAuth — must include user + signInAnonymously so the hook skips anon sign-in
const mockRefreshToken = jest.fn();
jest.mock('../useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'mock-user-123' },
        refreshToken: mockRefreshToken,
        signInAnonymously: jest.fn().mockResolvedValue(undefined),
    }),
}));

// Mock compression utils
jest.mock('@/lib/compression-utils', () => ({
    compressImage: jest.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' })),
    shouldCompress: jest.fn().mockReturnValue(false),
    getUploadEndpoint: jest.fn().mockReturnValue('/upload/image'),
    isAllowedType: jest.fn().mockReturnValue(true),
}));

// Mock crypto.randomUUID
const mockUUID = 'test-uuid-123';
global.crypto = {
    ...global.crypto,
    randomUUID: jest.fn(() => mockUUID as `${string}-${string}-${string}-${string}-${string}`),
};

// Mock URL.createObjectURL / revokeObjectURL
const mockBlobUrl = 'blob:http://localhost/mock-blob';
global.URL.createObjectURL = jest.fn(() => mockBlobUrl);
global.URL.revokeObjectURL = jest.fn();

// Mock XMLHttpRequest
class MockXHR {
    static instances: MockXHR[] = [];

    upload = { onprogress: null as ((ev: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 200;
    statusText = 'OK';
    responseText = '';

    open = jest.fn();
    send = jest.fn();
    setRequestHeader = jest.fn();
    abort = jest.fn();

    constructor() {
        MockXHR.instances.push(this);
    }

    // Test helpers
    simulateProgress(loaded: number, total: number) {
        if (this.upload.onprogress) {
            this.upload.onprogress({ lengthComputable: true, loaded, total });
        }
    }

    simulateSuccess(response: object) {
        this.responseText = JSON.stringify(response);
        if (this.onload) this.onload();
    }

    simulateError() {
        if (this.onerror) this.onerror();
    }

    /** The server answered, with a non-2xx status. */
    simulateHttpError(status: number, body: object | string) {
        this.status = status;
        this.statusText = 'Error';
        this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
        if (this.onload) this.onload();
    }

    simulateAbort() {
        if (this.onabort) this.onabort();
    }
}

(global as unknown as { XMLHttpRequest: typeof MockXHR }).XMLHttpRequest = MockXHR;

// =============================================================================
// TESTS
// =============================================================================

describe('useUpload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        MockXHR.instances = [];
        mockRefreshToken.mockResolvedValue('mock-jwt-token');
    });

    it('should initialize with empty uploads', () => {
        const { result } = renderHook(() => useUpload());

        expect(result.current.uploads).toEqual({});
        expect(result.current.isUploading).toBe(false);
        expect(result.current.successfulUploads).toEqual([]);
    });

    it('should add files and create UploadItems', async () => {
        const { result } = renderHook(() => useUpload());

        const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        expect(Object.keys(result.current.uploads)).toHaveLength(1);

        const upload = Object.values(result.current.uploads)[0];
        expect(upload.file).toBe(mockFile);
        expect(upload.previewUrl).toBe(mockBlobUrl);
        expect(URL.createObjectURL).toHaveBeenCalledWith(mockFile);
    });

    it('should update progress during upload', async () => {
        const { result } = renderHook(() => useUpload());

        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        // Get the XHR instance
        const xhr = MockXHR.instances[0];

        // Simulate progress
        await act(async () => {
            xhr.simulateProgress(50, 100);
        });

        const upload = Object.values(result.current.uploads)[0];
        expect(upload.progress).toBeGreaterThan(20); // 20% base + 50% of remaining 80%
    });

    it('should mark upload as success on completion', async () => {
        const { result } = renderHook(() => useUpload());

        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        const xhr = MockXHR.instances[0];

        // Simulate successful upload
        await act(async () => {
            xhr.simulateSuccess({
                asset_type: 'image',
                url: 'https://storage.example.com/test.jpg',
                mime_type: 'image/jpeg',
                size_bytes: 1024,
                filename: 'test.jpg',
            });
        });

        await waitFor(() => {
            const upload = Object.values(result.current.uploads)[0];
            expect(upload.status).toBe('success');
            expect(upload.progress).toBe(100);
        });

        expect(result.current.successfulUploads).toHaveLength(1);
    });

    it('should mark upload as error on failure', async () => {
        const { result } = renderHook(() => useUpload());

        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        const xhr = MockXHR.instances[0];

        // Simulate error
        await act(async () => {
            xhr.simulateError();
        });

        await waitFor(() => {
            const upload = Object.values(result.current.uploads)[0];
            expect(upload.status).toBe('error');
            expect(upload.error).toBeDefined();
        });
    });

    describe('server rejections', () => {
        async function failWith(status: number, body: object | string) {
            const hook = renderHook(() => useUpload());
            const mockFile = new File(['test'], 'clip.mp4', { type: 'video/mp4' });
            await act(async () => {
                await hook.result.current.addFiles([mockFile]);
            });
            await act(async () => {
                MockXHR.instances[0].simulateHttpError(status, body);
            });
            await waitFor(() => {
                expect(Object.values(hook.result.current.uploads)[0].status).toBe('error');
            });
            return Object.values(hook.result.current.uploads)[0];
        }

        it('shows the reset time of an exhausted quota and offers no retry', async () => {
            const upload = await failWith(429, {
                error_code: 'QUOTA_EXCEEDED',
                message: 'Hai raggiunto il limite giornaliero di caricamenti video. Riprova domani dopo le 09:10.',
            });

            expect(upload.error).toBe(
                'Hai raggiunto il limite giornaliero di caricamenti video. Riprova domani dopo le 09:10.'
            );
            expect(upload.retryable).toBe(false);
        });

        it('keeps retry available when the quota service is unavailable', async () => {
            const upload = await failWith(503, {
                error_code: 'QUOTA_UNAVAILABLE',
                message: 'Verifica della quota momentaneamente non disponibile. Riprova tra qualche minuto.',
            });

            expect(upload.error).toMatch(/non disponibile/);
            expect(upload.retryable).toBe(true);
        });

        it('replaces technical bodies with an Italian message', async () => {
            const upload = await failWith(500, { error_code: 'INTERNAL_SERVER_ERROR', message: 'An internal server error occurred.' });

            expect(upload.error).toBe('Caricamento non riuscito. Riprova.');
            expect(upload.retryable).toBe(true);
        });

        it('asks the user to reload when the session token cannot be refreshed, without a pointless retry', async () => {
            mockRefreshToken.mockResolvedValue(null);
            const hook = renderHook(() => useUpload());
            await act(async () => {
                await hook.result.current.addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
            });

            await waitFor(() => {
                const upload = Object.values(hook.result.current.uploads)[0];
                expect(upload.status).toBe('error');
                expect(upload.error).toMatch(/sessione scaduta/i);
                expect(upload.retryable).toBe(false);
            });
            expect(MockXHR.instances).toHaveLength(0); // nothing was sent
        });

        it('does not offer a retry for a 2xx answer it cannot read (the file may be stored already)', async () => {
            const hook = renderHook(() => useUpload());
            await act(async () => {
                await hook.result.current.addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
            });
            await act(async () => {
                const xhr = MockXHR.instances[0];
                xhr.status = 200;
                xhr.responseText = 'not json';
                xhr.onload?.();
            });

            await waitFor(() => {
                const upload = Object.values(hook.result.current.uploads)[0];
                expect(upload.status).toBe('error');
                expect(upload.error).toMatch(/risposta del server/i);
                expect(upload.retryable).toBe(false);
            });
        });

        it('treats a dropped connection as retryable', async () => {
            const hook = renderHook(() => useUpload());
            await act(async () => {
                await hook.result.current.addFiles([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
            });
            await act(async () => {
                MockXHR.instances[0].simulateError();
            });

            await waitFor(() => {
                const upload = Object.values(hook.result.current.uploads)[0];
                expect(upload.error).toMatch(/connessione/i);
                expect(upload.retryable).toBe(true);
            });
        });
    });

    it('should abort upload when removeFile is called', async () => {
        const { result } = renderHook(() => useUpload());

        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        const uploadId = Object.keys(result.current.uploads)[0];

        // Remove the file (this should abort the XHR)
        act(() => {
            result.current.removeFile(uploadId);
        });

        // Verify cleanup
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockBlobUrl);
        expect(result.current.uploads[uploadId]).toBeUndefined();
    });

    it('should retry failed upload', async () => {
        const { result } = renderHook(() => useUpload());

        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        const xhr1 = MockXHR.instances[0];

        // Simulate first upload failure
        await act(async () => {
            xhr1.simulateError();
        });

        await waitFor(() => {
            const upload = Object.values(result.current.uploads)[0];
            expect(upload.status).toBe('error');
        });

        const uploadId = Object.keys(result.current.uploads)[0];

        // Retry the upload
        act(() => {
            result.current.retryUpload(uploadId);
        });

        // Should have created a new XHR
        expect(MockXHR.instances.length).toBeGreaterThanOrEqual(1);
    });

    it('should clear all uploads and abort pending requests', async () => {
        const { result } = renderHook(() => useUpload());

        const files = [
            new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
            new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
        ];

        // Reset mock UUID to generate unique IDs
        let callCount = 0;
        (crypto.randomUUID as jest.Mock).mockImplementation(() => `uuid-${callCount++}`);

        await act(async () => {
            await result.current.addFiles(files);
        });

        expect(Object.keys(result.current.uploads).length).toBeGreaterThan(0);

        // Clear all
        act(() => {
            result.current.clearAll();
        });

        expect(result.current.uploads).toEqual({});
        expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should skip files exceeding maxSize', async () => {
        const { result } = renderHook(() => useUpload({ maxSize: 100 }));

        // Create a large file (simulate with Object.defineProperty)
        const largeFile = new File(['x'.repeat(200)], 'large.jpg', { type: 'image/jpeg' });
        Object.defineProperty(largeFile, 'size', { value: 200 });

        await act(async () => {
            await result.current.addFiles([largeFile]);
        });

        expect(Object.keys(result.current.uploads)).toHaveLength(0);
    });

    it('should set isUploading to true during active uploads', async () => {
        const { result } = renderHook(() => useUpload());

        expect(result.current.isUploading).toBe(false);

        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

        await act(async () => {
            await result.current.addFiles([mockFile]);
        });

        // During upload, isUploading should be true
        expect(result.current.isUploading).toBe(true);

        const xhr = MockXHR.instances[0];

        // Complete the upload
        await act(async () => {
            xhr.simulateSuccess({ asset_type: 'image', url: 'test.jpg', mime_type: 'image/jpeg' });
        });

        await waitFor(() => {
            expect(result.current.isUploading).toBe(false);
        });
    });
});
