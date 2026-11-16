import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProfilePage from '../page';
import { updateProfileDisplayName, uploadProfileAvatar } from '@/lib/auth/profile-client';
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

jest.mock('@/lib/auth/profile-client', () => ({
    updateProfileDisplayName: jest.fn(),
    uploadProfileAvatar: jest.fn(),
}));

jest.mock('@/lib/media-utils', () => ({
    compressImage: jest.fn(),
}));

const mockUpdateProfileDisplayName = updateProfileDisplayName as jest.Mock;
const mockUploadProfileAvatar = uploadProfileAvatar as jest.Mock;
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
        mockUploadProfileAvatar.mockResolvedValue({ success: false, message: 'Il file non può superare i 5MB.' });
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
        mockUploadProfileAvatar.mockResolvedValue({
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

    it('blocks a file that is still over 5MB after compression, without calling the upload helper', async () => {
        const oversizedAfterCompression = makeFile('photo.webp', 'image/webp', 5 * 1024 * 1024 + 1);
        mockCompressImage.mockResolvedValue(oversizedAfterCompression);
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = makeFile('photo.jpg', 'image/jpeg', 8 * 1024 * 1024);
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/non può superare i 5MB, anche dopo la compressione/);
        });
        expect(mockUploadProfileAvatar).not.toHaveBeenCalled();
    });

    it('resets the file input value after processing, so re-selecting the same file re-fires onChange', async () => {
        mockUploadProfileAvatar.mockResolvedValue({ success: true, message: 'ok' });
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = makeFile('photo.jpg', 'image/jpeg', 1024);
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => expect(mockUploadProfileAvatar).toHaveBeenCalledTimes(1));
        expect(input.value).toBe('');
    });

    it('calls updateProfileDisplayName with the edited displayName and shows status beside Save', async () => {
        mockUpdateProfileDisplayName.mockResolvedValue({ success: true, message: 'Profilo salvato correttamente.' });
        render(<ProfilePage />);

        const nameInput = screen.getByLabelText('Nome Visualizzato') as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'Luca Bianchi' } });
        fireEvent.click(screen.getByRole('button', { name: /Salva Modifiche/i }));

        const saveSection = await screen.findByTestId('profile-save-section');
        await waitFor(() => {
            expect(within(saveSection).getByRole('status')).toHaveTextContent('Profilo salvato correttamente.');
        });
        expect(mockUpdateProfileDisplayName).toHaveBeenCalledWith('Luca Bianchi');
        expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    });

    it('shows the field-level error, focuses the name input, and surfaces the error beside Save', async () => {
        mockUpdateProfileDisplayName.mockResolvedValue({
            success: false,
            message: 'Validazione fallita. Controlla i campi inseriti.',
            errors: { displayName: ['Il nome deve contenere almeno 2 caratteri'] },
        });
        render(<ProfilePage />);

        fireEvent.click(screen.getByRole('button', { name: /Salva Modifiche/i }));

        const saveSection = await screen.findByTestId('profile-save-section');
        await waitFor(() => {
            expect(screen.getByText('Il nome deve contenere almeno 2 caratteri')).toBeInTheDocument();
        });
        expect(within(saveSection).getByRole('alert')).toHaveTextContent('Validazione fallita. Controlla i campi inseriti.');
        expect(screen.getByLabelText('Nome Visualizzato')).toHaveFocus();
    });

    it('never renders an avatar preview that is not a browser object URL', async () => {
        // Simulates the regression the isObjectUrl guard exists for: a remote or
        // server-provided string funnelled into the preview state must not reach
        // the <img src> sink (CodeQL js/xss-through-dom, alert #20).
        (URL.createObjectURL as jest.Mock).mockReturnValue('javascript:alert(1)');
        mockUploadProfileAvatar.mockResolvedValue({ success: false, message: 'Upload non riuscito.' });
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeFile('photo.jpg', 'image/jpeg', 1024)] } });

        await waitFor(() => expect(mockUploadProfileAvatar).toHaveBeenCalled());
        expect(document.querySelector('img[src^="javascript:"]')).toBeNull();
    });

    it('renders the avatar preview when it is a blob: object URL', async () => {
        mockUploadProfileAvatar.mockResolvedValue({ success: false, message: 'Upload non riuscito.' });
        render(<ProfilePage />);

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeFile('photo.jpg', 'image/jpeg', 1024)] } });

        await waitFor(() => {
            expect(document.querySelector('img[src="blob:mock-preview"]')).not.toBeNull();
        });
    });

    it('surfaces a notifications-toggle failure in the shared banner', async () => {
        mockPreferencesError = 'Errore nel salvataggio delle preferenze';
        render(<ProfilePage />);

        expect(await screen.findByRole('alert')).toHaveTextContent('Errore nel salvataggio delle preferenze');
    });
});
