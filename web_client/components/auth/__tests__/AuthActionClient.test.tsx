import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthActionClient, sanitizeContinueUrl } from '../AuthActionClient';

const mockVerifyResetCode = jest.fn();
const mockConfirmReset = jest.fn();
const mockApplyActionCode = jest.fn();
const mockCheckActionCode = jest.fn();

jest.mock('firebase/auth', () => ({
    verifyPasswordResetCode: (...a: unknown[]) => mockVerifyResetCode(...a),
    confirmPasswordReset: (...a: unknown[]) => mockConfirmReset(...a),
    applyActionCode: (...a: unknown[]) => mockApplyActionCode(...a),
    checkActionCode: (...a: unknown[]) => mockCheckActionCode(...a),
}));

jest.mock('@/lib/firebase', () => ({ auth: {} }));

let mockParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
    useSearchParams: () => mockParams,
}));

const STRONG = 'NuovaPass1!x';

describe('sanitizeContinueUrl', () => {
    it('allows internal relative paths', () => {
        expect(sanitizeContinueUrl('/dashboard/profile')).toBe('/dashboard/profile');
    });

    it('rejects protocol-relative or external URLs to prevent open redirects', () => {
        expect(sanitizeContinueUrl('//evil.example.com')).toBe('/');
        expect(sanitizeContinueUrl('https://evil.example.com/phish')).toBe('/');
        expect(sanitizeContinueUrl('javascript:alert(1)')).toBe('/');
        expect(sanitizeContinueUrl('/\\evil.com')).toBe('/');
        expect(sanitizeContinueUrl(null)).toBe('/');
    });

    it('accepts same-origin URLs and strips origin to relative path', () => {
        expect(sanitizeContinueUrl(`${window.location.origin}/dashboard?ok=1`)).toBe('/dashboard?ok=1');
    });
});

describe('AuthActionClient', () => {
    beforeEach(() => {
        mockVerifyResetCode.mockReset();
        mockConfirmReset.mockReset();
        mockApplyActionCode.mockReset();
        mockCheckActionCode.mockReset();
        mockParams = new URLSearchParams();
    });

    it('shows invalid link state when mode or oobCode is missing', async () => {
        render(<AuthActionClient />);
        expect(await screen.findByText(/Link non valido o incompleto/i)).toBeInTheDocument();
        expect(mockVerifyResetCode).not.toHaveBeenCalled();
    });

    it('verifies resetPassword code, requires strong password twice, and confirms reset', async () => {
        mockParams = new URLSearchParams({
            mode: 'resetPassword',
            oobCode: 'code-123',
            continueUrl: 'https://evil.com',
        });
        mockVerifyResetCode.mockResolvedValue('utente@esempio.it');
        mockConfirmReset.mockResolvedValue(undefined);

        render(<AuthActionClient />);

        expect(await screen.findByText(/utente@esempio.it/i)).toBeInTheDocument();

        const pwd = screen.getByLabelText('Nuova password', { selector: 'input' });
        const confirm = screen.getByLabelText('Conferma nuova password', { selector: 'input' });

        // Mismatch blocks submit
        fireEvent.change(pwd, { target: { value: STRONG } });
        fireEvent.change(confirm, { target: { value: `${STRONG}z` } });
        fireEvent.click(screen.getByRole('button', { name: /Salva nuova password/i }));

        expect(await screen.findByText('Le password non coincidono.')).toBeInTheDocument();
        expect(mockConfirmReset).not.toHaveBeenCalled();

        // Matching strong password succeeds
        fireEvent.change(confirm, { target: { value: STRONG } });
        fireEvent.click(screen.getByRole('button', { name: /Salva nuova password/i }));

        await waitFor(() => expect(mockConfirmReset).toHaveBeenCalledWith({}, 'code-123', STRONG));
        expect(await screen.findByText(/Password aggiornata/i)).toBeInTheDocument();

        // Safe fallback continue link (evil continueUrl stripped to /)
        const link = screen.getByRole('link', { name: /Torna alla home/i });
        expect(link).toHaveAttribute('href', '/');
    });

    it('surfaces expired code error nicely for resetPassword', async () => {
        mockParams = new URLSearchParams({ mode: 'resetPassword', oobCode: 'expired-1' });
        mockVerifyResetCode.mockRejectedValue({ code: 'auth/expired-action-code' });

        render(<AuthActionClient />);
        expect(await screen.findByText(/Link scaduto/i)).toBeInTheDocument();
    });

    it('applies verifyEmail action code', async () => {
        mockParams = new URLSearchParams({ mode: 'verifyEmail', oobCode: 'v-1' });
        mockApplyActionCode.mockResolvedValue(undefined);

        render(<AuthActionClient />);
        await waitFor(() => expect(mockApplyActionCode).toHaveBeenCalledWith({}, 'v-1'));
        expect(await screen.findByText(/Email verificata/i)).toBeInTheDocument();
    });

    it('checks and applies recoverEmail action code', async () => {
        mockParams = new URLSearchParams({ mode: 'recoverEmail', oobCode: 'r-1' });
        mockCheckActionCode.mockResolvedValue({ data: { email: 'vecchia@esempio.it' } });
        mockApplyActionCode.mockResolvedValue(undefined);

        render(<AuthActionClient />);
        await waitFor(() => {
            expect(mockCheckActionCode).toHaveBeenCalledWith({}, 'r-1');
            expect(mockApplyActionCode).toHaveBeenCalledWith({}, 'r-1');
        });
        expect(await screen.findByText(/Indirizzo email ripristinato/i)).toBeInTheDocument();
        expect(screen.getByText(/vecchia@esempio\.it/)).toBeInTheDocument();
    });
});
