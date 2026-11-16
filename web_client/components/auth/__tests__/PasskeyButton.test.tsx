import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PasskeyButton } from '../PasskeyButton';
import { clearDevicePasskey, markDevicePasskey } from '@/lib/auth/passkey-device';

const mockAuthenticate = jest.fn();
const mockRegister = jest.fn();
jest.mock('@/hooks/usePasskey', () => ({
    usePasskey: () => ({
        checkSupport: async () => ({ isSupported: true, isPlatformAuthenticator: true }),
        registerPasskey: mockRegister,
        authenticateWithPasskey: mockAuthenticate,
        isRegistering: false,
        isAuthenticating: false,
    }),
}));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@/lib/haptics', () => ({ triggerHaptic: jest.fn() }));

describe('PasskeyButton (login) — device enrolment gate', () => {
    beforeEach(() => {
        mockAuthenticate.mockReset();
        mockRegister.mockReset();
        clearDevicePasskey();
    });

    it('is locked and, on tap, explains that biometrics are activated from the profile after email login — without starting WebAuthn', async () => {
        render(<PasskeyButton mode="login" />);
        const button = await screen.findByRole('button', { name: /accedi con biometria/i });

        expect(button).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(button);

        expect(await screen.findByText(/non è ancora attivo su questo dispositivo/i)).toBeInTheDocument();
        expect(screen.getByText(/Profilo utente/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Email/i).length).toBeGreaterThan(0);
        expect(mockAuthenticate).not.toHaveBeenCalled();
    });

    it('becomes active once biometrics were activated on this device, and starts the passkey login', async () => {
        mockAuthenticate.mockResolvedValue({});
        const onSuccess = jest.fn();
        render(<PasskeyButton mode="login" onSuccess={onSuccess} />);
        const button = await screen.findByRole('button', { name: /accedi con biometria/i });
        expect(button).toHaveAttribute('aria-disabled', 'true');

        act(() => {
            markDevicePasskey();
        });
        await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));

        fireEvent.click(button);

        await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
        expect(onSuccess).toHaveBeenCalled();
    });
});
