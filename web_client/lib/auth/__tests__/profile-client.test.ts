import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { updateProfileDisplayName, uploadProfileAvatar } from '../profile-client';

const fileBytes = new WeakMap<File, Uint8Array>();
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

function createTestFile(size: number, name: string, type: string, header: number[] = WEBP_HEADER): File {
    const bytes = new Uint8Array(Math.max(size, header.length)).fill(1);
    bytes.set(header);
    const file = new File([bytes], name, { type });
    fileBytes.set(file, bytes);
    return file;
}

if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function (this: File) {
        const bytes = fileBytes.get(this);
        if (!bytes) {
            return Promise.reject(new Error('arrayBuffer() test polyfill: unknown File instance'));
        }
        return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    };
}

jest.mock('firebase/auth', () => ({
    updateProfile: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
    ref: jest.fn(),
    uploadBytes: jest.fn(),
    getDownloadURL: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
    auth: { currentUser: { uid: 'user-1', isAnonymous: false } },
    storage: { app: 'mock-storage' },
}));

const mockUpdateProfile = updateProfile as jest.Mock;
const mockRef = ref as jest.Mock;
const mockUploadBytes = uploadBytes as jest.Mock;
const mockGetDownloadURL = getDownloadURL as jest.Mock;

describe('lib/auth/profile-client', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (auth as { currentUser: { uid: string; isAnonymous: boolean } | null }).currentUser = {
            uid: 'user-1',
            isAnonymous: false,
        };
        mockUpdateProfile.mockResolvedValue(undefined);
        mockRef.mockReturnValue('users/user-1/avatar.webp');
        mockUploadBytes.mockResolvedValue({});
        mockGetDownloadURL.mockResolvedValue('https://firebasestorage.googleapis.com/v0/b/test/o/avatar.webp');
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('updateProfileDisplayName', () => {
        it('requires an authenticated user', async () => {
            (auth as { currentUser: null }).currentUser = null;

            const result = await updateProfileDisplayName('Mario Rossi');

            expect(result).toEqual({
                success: false,
                message: 'Autenticazione richiesta. Effettua il login.',
            });
            expect(mockUpdateProfile).not.toHaveBeenCalled();
        });

        it('validates displayName and returns field-level errors without calling Firebase', async () => {
            const result = await updateProfileDisplayName('   ');

            expect(result.success).toBe(false);
            expect(result.errors?.displayName?.[0]).toMatch(/almeno 2 caratteri/);
            expect(mockUpdateProfile).not.toHaveBeenCalled();
        });

        it('trims and updates displayName via Firebase Client SDK', async () => {
            const result = await updateProfileDisplayName('  Mario Rossi  ');

            expect(result).toEqual({
                success: true,
                message: 'Profilo aggiornato con successo!',
            });
            expect(mockUpdateProfile).toHaveBeenCalledWith(auth.currentUser, {
                displayName: 'Mario Rossi',
            });
        });

        it('surfaces a helpful error message when Firebase requires recent login', async () => {
            mockUpdateProfile.mockRejectedValue({ code: 'auth/requires-recent-login' });

            const result = await updateProfileDisplayName('Mario Rossi');

            expect(result.success).toBe(false);
            expect(result.message).toMatch(/esci e accedi nuovamente/i);
        });
    });

    describe('uploadProfileAvatar', () => {
        it('requires an authenticated user', async () => {
            (auth as { currentUser: null }).currentUser = null;

            const result = await uploadProfileAvatar(createTestFile(64, 'a.webp', 'image/webp'));

            expect(result).toEqual({
                success: false,
                message: 'Autenticazione richiesta. Effettua il login.',
            });
            expect(mockUploadBytes).not.toHaveBeenCalled();
        });

        it('rejects files whose magic bytes are not a supported image format', async () => {
            const html = Array.from(Buffer.from('<html><script>'));
            const result = await uploadProfileAvatar(createTestFile(24, 'bad.png', 'image/png', html));

            expect(result.success).toBe(false);
            expect(result.message).toMatch(/Formato file non supportato/);
            expect(mockUploadBytes).not.toHaveBeenCalled();
        });

        it('uploads to Storage and updates photoURL via Firebase Client SDK', async () => {
            const file = createTestFile(128, 'avatar.webp', 'image/webp');

            const result = await uploadProfileAvatar(file);

            expect(mockRef).toHaveBeenCalledWith(storage, 'users/user-1/avatar.webp');
            expect(mockUploadBytes).toHaveBeenCalledWith(
                'users/user-1/avatar.webp',
                file,
                expect.objectContaining({ contentType: 'image/webp' }),
            );
            expect(mockUpdateProfile).toHaveBeenCalledWith(auth.currentUser, {
                photoURL: 'https://firebasestorage.googleapis.com/v0/b/test/o/avatar.webp',
            });
            expect(result).toEqual({
                success: true,
                message: 'Foto profilo aggiornata con successo!',
                photoURL: 'https://firebasestorage.googleapis.com/v0/b/test/o/avatar.webp',
            });
        });
    });
});
