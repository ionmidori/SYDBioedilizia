import { act, renderHook } from '@testing-library/react';
import { useFileUpload } from '../useFileUpload';
import { projectsApi } from '@/lib/projects-api';

jest.mock('firebase/storage', () => ({
    ref: jest.fn((_storage: unknown, path: string) => ({ path })),
    uploadBytesResumable: jest.fn(() => ({
        snapshot: { ref: {} },
        // The upload completes at once.
        on: (_event: string, _progress: unknown, _error: unknown, done: () => void) => { void done(); },
    })),
    getDownloadURL: jest.fn(() => Promise.resolve('https://cdn/download.jpg')),
}));
jest.mock('@/lib/firebase', () => ({ storage: {} }));
jest.mock('@/lib/projects-api', () => ({ projectsApi: { addProjectFile: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/lib/media-utils', () => ({ compressImage: (file: File) => Promise.resolve(file) }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1', isAnonymous: false } }) }));

const addProjectFile = projectsApi.addProjectFile as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useFileUpload — the room of an upload (Phase 139: media by room)', () => {
    it('files the upload in the room it was made for', async () => {
        const { result } = renderHook(() => useFileUpload());
        const file = new File(['x'], 'pianta.pdf', { type: 'application/pdf' });

        await act(async () => { await result.current.uploadFile(file, 'chat-1', 'document', 'bagno'); });

        expect(addProjectFile).toHaveBeenCalledWith('chat-1', expect.objectContaining({
            name: 'pianta.pdf', type: 'document', room_id: 'bagno',
        }));
        expect(addProjectFile.mock.calls[0][1].storage_path).toMatch(/^projects\/chat-1\/uploads\//);
    });

    it('leaves it unfiled without a room', async () => {
        const { result } = renderHook(() => useFileUpload());
        const file = new File(['x'], 'pianta.pdf', { type: 'application/pdf' });

        await act(async () => { await result.current.uploadFile(file, 'chat-1', 'document'); });

        expect(addProjectFile.mock.calls[0][1].room_id).toBeNull();
    });
});
