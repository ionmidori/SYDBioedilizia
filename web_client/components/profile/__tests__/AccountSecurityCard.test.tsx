import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountSecurityCard } from '../AccountSecurityCard';

const mockReauth = jest.fn();
const mockUpdatePassword = jest.fn();
const mockLinkWithCredential = jest.fn();
const mockCredential = jest.fn((email: string, password: string) => ({ email, password }));

jest.mock('firebase/auth', () => ({
    reauthenticateWithCredential: (...a: unknown[]) => mockReauth(...a),
    updatePassword: (...a: unknown[]) => mockUpdatePassword(...a),
    linkWithCredential: (...a: unknown[]) => mockLinkWithCredential(...a),
    EmailAuthProvider: { credential: (email: string, password: string) => mockCredential(email, password) },
}));

const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
const mockLogout = jest.fn().mockResolvedValue(undefined);
let mockUser: {
    uid: string;
    email: string | null;
    isAnonymous?: boolean;
    providerData: Array<{ providerId: string }>;
} | null = null;

jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser, logout: mockLogout }),
}));

const mockFetchValidated = jest.fn();
jest.mock('@/lib/api-client', () => ({
    fetchValidated: (...a: unknown[]) => mockFetchValidated(...a),
}));

const STRONG = 'NuovaPass1!x';

function field(label: string): HTMLInputElement {
    return screen.getByLabelText(label, { selector: 'input' }) as HTMLInputElement;
}

describe('AccountSecurityCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUser = {
            uid: 'u1',
            email: 'mario@example.com',
            isAnonymous: false,
            providerData: [{ providerId: 'password' }],
        };
        mockReauth.mockResolvedValue({});
        mockUpdatePassword.mockResolvedValue(undefined);
        mockLinkWithCredential.mockResolvedValue({});
        mockFetchValidated.mockResolvedValue({ revoked: true, message: 'ok' });
    });

    it('renders nothing for anonymous or email-less users', () => {
        mockUser = { uid: 'anon', email: null, isAnonymous: true, providerData: [] };
        const { container } = render(<AccountSecurityCard />);
        expect(container.firstChild).toBeNull();
    });

    it('reauthenticates and updates password when current + confirmed new strong password are valid', async () => {
        render(<AccountSecurityCard />);

        fireEvent.change(field('Password attuale'), { target: { value: 'OldPass1!xy' } });
        fireEvent.change(field('Nuova password'), { target: { value: STRONG } });
        fireEvent.change(field('Conferma nuova password'), { target: { value: STRONG } });
        fireEvent.click(screen.getByRole('button', { name: /Aggiorna password/i }));

        await waitFor(() => expect(mockReauth).toHaveBeenCalledWith(mockUser, { email: 'mario@example.com', password: 'OldPass1!xy' }));
        await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith(mockUser, STRONG));
        expect(await screen.findByText(/Password aggiornata con successo/i)).toBeInTheDocument();
    });

    it('blocks password change when new password confirmation mismatches', async () => {
        render(<AccountSecurityCard />);

        fireEvent.change(field('Password attuale'), { target: { value: 'OldPass1!xy' } });
        fireEvent.change(field('Nuova password'), { target: { value: STRONG } });
        fireEvent.change(field('Conferma nuova password'), { target: { value: `${STRONG}z` } });
        fireEvent.click(screen.getByRole('button', { name: /Aggiorna password/i }));

        expect(await screen.findByText('Le password non coincidono.')).toBeInTheDocument();
        expect(mockReauth).not.toHaveBeenCalled();
        expect(mockUpdatePassword).not.toHaveBeenCalled();
    });

    it('shows a clear Italian message when current password is wrong during reauthentication', async () => {
        mockReauth.mockRejectedValue({ code: 'auth/invalid-credential' });
        render(<AccountSecurityCard />);

        fireEvent.change(field('Password attuale'), { target: { value: 'WrongPass1!' } });
        fireEvent.change(field('Nuova password'), { target: { value: STRONG } });
        fireEvent.change(field('Conferma nuova password'), { target: { value: STRONG } });
        fireEvent.click(screen.getByRole('button', { name: /Aggiorna password/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/password attuale non è corretta/i);
        expect(mockUpdatePassword).not.toHaveBeenCalled();
    });

    it('offers "Imposta password" via linkWithCredential when user signed in with Google only', async () => {
        mockUser = {
            uid: 'u-google',
            email: 'mario@gmail.com',
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
        };
        render(<AccountSecurityCard />);

        expect(screen.queryByLabelText('Password attuale', { selector: 'input' })).toBeNull();
        fireEvent.change(field('Nuova password'), { target: { value: STRONG } });
        fireEvent.change(field('Conferma nuova password'), { target: { value: STRONG } });
        fireEvent.click(screen.getByRole('button', { name: /Imposta password/i }));

        await waitFor(() =>
            expect(mockLinkWithCredential).toHaveBeenCalledWith(mockUser, { email: 'mario@gmail.com', password: STRONG }),
        );
        expect(mockRefreshUser).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/Password impostata con successo/i)).toBeInTheDocument();
    });

    it('revokes all sessions via backend endpoint and logs out after inline confirmation', async () => {
        render(<AccountSecurityCard />);

        fireEvent.click(screen.getByRole('button', { name: /Disconnetti tutti i dispositivi/i }));
        expect(mockFetchValidated).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Conferma disconnessione/i }));

        await waitFor(() => expect(mockFetchValidated).toHaveBeenCalledWith(
            '/api/py/users/me/sessions/revoke',
            expect.anything(),
            { method: 'POST' },
        ));
        await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    });
});
