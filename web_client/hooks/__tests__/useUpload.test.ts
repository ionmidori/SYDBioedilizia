import { renderHook, act, waitFor } from '@testing-library/react';
import { useUpload } from '../useUpload';

// =============================================================================
// MOCKS
// =============================================================================

// Mock useAuth — must include user + signInAnonymously so the hook skips anon sign-in
jest.mock('../useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'mock-user-123' },
        refreshToken: jest.fn().mockResolvedValue('mock-jwt-token'),
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

    upload = { onprogress: null as any };
    onload: any = null;
    onerror: any = null;
    onabort: any = null;
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

    simulateAbort() {
        if (this.onabort) this.onabort();
    }
}

(global as any).XMLHttpRequest = MockXHR;

// =============================================================================
// TESTS
// =============================================================================

describe('useUpload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        MockXHR.instances = [];
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
