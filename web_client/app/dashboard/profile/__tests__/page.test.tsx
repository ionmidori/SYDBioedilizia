import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePage from '../page';
import { updateUserProfile, uploadUserAvatar } from '@/app/actions/profile';
import { compressImage } from '@/lib/media-utils';

const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
let mockUser: { uid: string; displayName: string | null; email: string | null; photoURL: string | null } | null = {
    uid: 'user-1',
    displayName: 'Mario Rossi',
    email: 'mario@example.com',
    photoURL: null,
};
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }),
}));

const mockUpdatePreferences = jest.fn().mockResolvedValue(undefined);
let mockPreferencesError: string | null = null;
jest.mock('@/hooks/useUserPreferences', () => ({
    useUserPreferences: () => ({
        preferences: { notifications: { email: true, quoteReady: false }, ui: { sidebarCollapsed: false } },
        updatePreferences: mockUpdatePreferences,
        error: mockPreferencesError,
    }),
}));

// A stable reference across renders — matches the real hook's useCallback([user])
// and avoids spuriously re-firing the effect that seeds displayName from `user`.
const mockCheckHasPasskeys = jest.fn();
jest.mock('@/hooks/usePasskey', () => ({
    usePasskey: () => ({ checkHasPasskeys: mockCheckHasPasskeys, hasPasskeys: false }),
}));

jest.mock('@/components/auth/PasskeyButton', () => ({
    PasskeyButton: () => <div data-testid="passkey-button-stub" />,
}));

jest.mock('@/app/actions/profile', () => ({
    updateUserProfile: jest.fn(),
    uploadUserAvatar: jest.fn(),
}));

jest.mock('@/lib/media-utils', () => ({
    compressImage: jest.fn(),
}));

const mockUpdateUserProfile = updateUserProfile as jest.Mock;
const mockUploadUserAvatar = uploadUserAvatar as jest.Mock;
const mockCompressImage = compressImage as jest.Mock;

function makeFile(name: string, type: string, size: number): File {
    const file = new File([new Uint8Array(size)], name, { type });
    return file;
}

describe('ProfilePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPreferencesError = null;
        mockUser = {
            uid: 'user-1',
            displayName: 'Mario Rossi',
            email: 'mario@example.com',
            photoURL: null,
        };
        // Default: compressImage is the identity function.
        mockCompressImage.mockImplementation(async (file: File) => file);
        URL.createObjectURL = jest.fn(() => 'blob:mock-preview');
        URL.revokeObjectURL = jest.fn();
    });

    it('shows an error banner when the avatar upload fails, without crashing', async () => {
        mockUploadUserAvatar.mockResolvedValue({ success: false, message: 'Il file non può superare i 5MB.' });
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = makeFile('photo.jpg', 'image/jpeg', 1024); // small enough to pass the client-side check
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Il file non può superare i 5MB.');
        });
        expect(mockRefreshUser).not.toHaveBeenCalled();
    });

    it('shows a success banner and refreshes the user when the avatar upload succeeds', async () => {
        mockUploadUserAvatar.mockResolvedValue({
            success: true,
            message: 'Foto profilo aggiornata!',
            photoURL: 'https://storage.googleapis.com/bucket/users/user-1/avatar.webp',
        });
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = makeFile('photo.jpg', 'image/jpeg', 1024);
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByRole('status')).toHaveTextContent('Foto profilo aggiornata!');
        });
        expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    });

    it('blocks a file that is still over 5MB after compression, without calling the Server Action', async () => {
        const oversizedAfterCompression = makeFile('photo.webp', 'image/webp', 5 * 1024 * 1024 + 1);
        mockCompressImage.mockResolvedValue(oversizedAfterCompression);
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = makeFile('photo.jpg', 'image/jpeg', 8 * 1024 * 1024);
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/non può superare i 5MB, anche dopo la compressione/);
        });
        expect(mockUploadUserAvatar).not.toHaveBeenCalled();
    });

    it('resets the file input value after processing, so re-selecting the same file re-fires onChange', async () => {
        mockUploadUserAvatar.mockResolvedValue({ success: true, message: 'ok' });
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = makeFile('photo.jpg', 'image/jpeg', 1024);
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => expect(mockUploadUserAvatar).toHaveBeenCalledTimes(1));
        expect(input.value).toBe('');
    });

    it('calls updateUserProfile with the edited displayName when Save is clicked', async () => {
        mockUpdateUserProfile.mockResolvedValue({ success: true, message: 'Profilo salvato correttamente.' });
        render(<ProfilePage />);

        const nameInput = screen.getByLabelText('Nome Visualizzato') as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'Luca Bianchi' } });
        fireEvent.click(screen.getByRole('button', { name: /Salva Modifiche/i }));

        await waitFor(() => {
            expect(screen.getByRole('status')).toHaveTextContent('Profilo salvato correttamente.');
        });
        const sentFormData = mockUpdateUserProfile.mock.calls[0][0] as FormData;
        expect(sentFormData.get('displayName')).toBe('Luca Bianchi');
        expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    });

    it('shows the field-level error returned by updateUserProfile', async () => {
        mockUpdateUserProfile.mockResolvedValue({
            success: false,
            message: 'Validazione fallita. Controlla i campi inseriti.',
            errors: { displayName: ['Il nome deve contenere almeno 2 caratteri'] },
        });
        render(<ProfilePage />);

        fireEvent.click(screen.getByRole('button', { name: /Salva Modifiche/i }));

        await waitFor(() => {
            expect(screen.getByText('Il nome deve contenere almeno 2 caratteri')).toBeInTheDocument();
        });
        expect(screen.getByRole('alert')).toHaveTextContent('Validazione fallita. Controlla i campi inseriti.');
    });

    it('surfaces a notifications-toggle failure in the shared banner', async () => {
        mockPreferencesError = 'Errore nel salvataggio delle preferenze';
        render(<ProfilePage />);

        expect(await screen.findByRole('alert')).toHaveTextContent('Errore nel salvataggio delle preferenze');
    });
});
