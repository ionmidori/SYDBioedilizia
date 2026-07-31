import { updateUserProfile, uploadUserAvatar } from '../profile';

// jsdom's File/Blob (jest-environment-jsdom) do not implement `.arrayBuffer()`,
// which `uploadUserAvatar` relies on. Polyfill it against the bytes the test
// itself supplied, tracked in a WeakMap — avoids depending on jsdom internals.
const fileBytes = new WeakMap<File, Uint8Array>();

function createTestFile(size: number, name: string, type: string): File {
    const bytes = new Uint8Array(size).fill(1);
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

const mockCookieGet = jest.fn();
jest.mock('next/headers', () => ({
    cookies: async () => ({ get: mockCookieGet }),
}));

const mockRevalidatePath = jest.fn();
jest.mock('next/cache', () => ({
    revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const mockVerifyIdToken = jest.fn();
const mockUpdateUser = jest.fn();
const mockSave = jest.fn();
const mockMakePublic = jest.fn();
const mockFile = jest.fn(() => ({ save: mockSave, makePublic: mockMakePublic }));
const mockBucket = jest.fn(() => ({ name: 'test-bucket', file: mockFile }));

jest.mock('@/lib/firebase-admin', () => ({
    // async: getFirebaseAuth loads firebase-admin/auth dynamically and returns a
    // Promise. Awaiting a plain object would also pass, so mirroring the real
    // signature here is what keeps this mock honest.
    getFirebaseAuth: async () => ({ verifyIdToken: mockVerifyIdToken, updateUser: mockUpdateUser }),
    getFirebaseStorage: () => ({ bucket: mockBucket }),
}));

function setAuthCookie(present: boolean) {
    mockCookieGet.mockReturnValue(present ? { value: 'valid-token' } : undefined);
}

describe('app/actions/profile.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setAuthCookie(true);
        mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
        mockSave.mockResolvedValue(undefined);
        mockMakePublic.mockResolvedValue(undefined);
        mockUpdateUser.mockResolvedValue(undefined);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('updateUserProfile', () => {
        it('requires authentication', async () => {
            setAuthCookie(false);
            const formData = new FormData();
            formData.append('displayName', 'Mario Rossi');

            const result = await updateUserProfile(formData);

            expect(result).toEqual({
                success: false,
                message: 'Autenticazione richiesta. Effettua il login.',
            });
            expect(mockVerifyIdToken).not.toHaveBeenCalled();
        });

        it('rejects a displayName that fails validation and reports the field error', async () => {
            const formData = new FormData();
            formData.append('displayName', 'A'); // shorter than the 2-char minimum

            const result = await updateUserProfile(formData);

            expect(result.success).toBe(false);
            expect(result.errors?.displayName?.[0]).toMatch(/almeno 2 caratteri/);
            expect(mockUpdateUser).not.toHaveBeenCalled();
        });

        it('updates displayName on success and revalidates the profile page', async () => {
            const formData = new FormData();
            formData.append('displayName', 'Mario Rossi');

            const result = await updateUserProfile(formData);

            expect(result.success).toBe(true);
            expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { displayName: 'Mario Rossi' });
            expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/profile');
        });
    });

    describe('uploadUserAvatar', () => {
        it('requires authentication', async () => {
            setAuthCookie(false);
            const formData = new FormData();

            const result = await uploadUserAvatar(formData);

            expect(result).toEqual({
                success: false,
                message: 'Autenticazione richiesta. Effettua il login.',
            });
        });

        it('rejects when no file is provided', async () => {
            const formData = new FormData();

            const result = await uploadUserAvatar(formData);

            expect(result).toEqual({ success: false, message: 'Nessun file selezionato.' });
        });

        it('rejects a file over 5MB', async () => {
            const oversized = createTestFile(5 * 1024 * 1024 + 1, 'avatar.webp', 'image/webp');
            const formData = new FormData();
            formData.append('avatar', oversized);

            const result = await uploadUserAvatar(formData);

            expect(result).toEqual({ success: false, message: 'Il file non può superare i 5MB.' });
            expect(mockSave).not.toHaveBeenCalled();
        });

        it('rejects an unsupported MIME type', async () => {
            const badFile = createTestFile(10, 'avatar.gif', 'image/gif');
            const formData = new FormData();
            formData.append('avatar', badFile);

            const result = await uploadUserAvatar(formData);

            expect(result.success).toBe(false);
            expect(result.message).toMatch(/Formato file non supportato/);
        });

        it('returns a distinct message when the Storage upload itself fails', async () => {
            mockSave.mockRejectedValue(new Error('storage: permission denied'));
            const file = createTestFile(10, 'avatar.webp', 'image/webp');
            const formData = new FormData();
            formData.append('avatar', file);

            const result = await uploadUserAvatar(formData);

            expect(result).toEqual({
                success: false,
                message: 'Errore durante il caricamento della foto. Riprova.',
            });
            expect(mockUpdateUser).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(
                '[Server Action] Avatar storage upload failed:',
                expect.any(Error)
            );
        });

        it('returns a distinct message when the file saved but updateUser fails', async () => {
            mockUpdateUser.mockRejectedValue(new Error('auth: internal error'));
            const file = createTestFile(10, 'avatar.webp', 'image/webp');
            const formData = new FormData();
            formData.append('avatar', file);

            const result = await uploadUserAvatar(formData);

            expect(result).toEqual({
                success: false,
                message: 'Foto caricata ma non è stato possibile aggiornare il profilo. Riprova.',
            });
            expect(mockSave).toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(
                '[Server Action] Failed to update photoURL on user record:',
                expect.any(Error)
            );
        });

        it('uploads, updates photoURL and revalidates on the happy path', async () => {
            const file = createTestFile(10, 'avatar.webp', 'image/webp');
            const formData = new FormData();
            formData.append('avatar', file);

            const result = await uploadUserAvatar(formData);

            expect(result.success).toBe(true);
            expect(result.photoURL).toBe('https://storage.googleapis.com/test-bucket/users/user-1/avatar.webp');
            expect(mockUpdateUser).toHaveBeenCalledWith('user-1', {
                photoURL: 'https://storage.googleapis.com/test-bucket/users/user-1/avatar.webp',
            });
            expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/profile');
        });
    });
});
