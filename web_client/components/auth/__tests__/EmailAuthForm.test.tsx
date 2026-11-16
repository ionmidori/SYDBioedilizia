import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailAuthForm } from '../EmailAuthForm';

const mockSignIn = jest.fn();
const mockCreateUser = jest.fn();
const mockSendReset = jest.fn();
jest.mock('firebase/auth', () => ({
    signInWithEmailAndPassword: (...a: unknown[]) => mockSignIn(...a),
    createUserWithEmailAndPassword: (...a: unknown[]) => mockCreateUser(...a),
    sendPasswordResetEmail: (...a: unknown[]) => mockSendReset(...a),
    EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
}));
jest.mock('@/lib/firebase', () => ({ auth: {} }));
jest.mock('@/lib/auth/guest-claim', () => ({
    signInKeepingGuestChats: (fn: () => Promise<unknown>) => fn(),
    createAccountKeepingGuestChats: (_cred: unknown, fn: () => Promise<unknown>) => fn(),
}));
jest.mock('@/utils/haptics', () => ({ triggerHaptic: jest.fn() }));

const STRONG = 'Password1!x';

function field(label: string): HTMLInputElement {
    return screen.getByLabelText(label, { selector: 'input' }) as HTMLInputElement;
}

function goToSignup() {
    render(<EmailAuthForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));
}

async function fillSignup(email: string, password: string, confirm: string) {
    fireEvent.change(field('Email'), { target: { value: email } });
    fireEvent.change(field('Password'), { target: { value: password } });
    fireEvent.change(field('Conferma password'), { target: { value: confirm } });
}

describe('EmailAuthForm — signup', () => {
    beforeEach(() => {
        mockSignIn.mockReset().mockResolvedValue({});
        mockCreateUser.mockReset().mockResolvedValue({});
        mockSendReset.mockReset().mockResolvedValue(undefined);
    });

    it('asks for the password a second time (confirmation field) and keeps stable E2E field ids', () => {
        goToSignup();
        expect(field('Email').id).toBe('email');
        expect(field('Password').id).toBe('password');
        const confirm = field('Conferma password');
        expect(confirm).toBeInTheDocument();
        expect(confirm.id).toBe('confirmPassword');
    });

    it('blocks submit and explains when the two passwords differ', async () => {
        goToSignup();
        await fillSignup('a@b.it', STRONG, `${STRONG}z`);
        fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));
        expect(await screen.findByText('Le password non coincidono.')).toBeInTheDocument();
        expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('blocks a weak password (no symbol) even if both fields match', async () => {
        goToSignup();
        await fillSignup('a@b.it', 'Password11xy', 'Password11xy');
        fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));
        expect(await screen.findByText(/almeno un simbolo/)).toBeInTheDocument();
        expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('creates the account when the strong password is confirmed', async () => {
        const onSuccess = jest.fn();
        render(<EmailAuthForm onSuccess={onSuccess} />);
        fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));
        await fillSignup('a@b.it', STRONG, STRONG);
        fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));
        await waitFor(() => expect(mockCreateUser).toHaveBeenCalledWith({}, 'a@b.it', STRONG));
        expect(onSuccess).toHaveBeenCalled();
    });

    it('shows a live checklist that turns on as the rules are met', () => {
        goToSignup();
        const list = screen.getByRole('list', { name: 'Requisiti password' });
        expect(list).toHaveTextContent('Almeno 10 caratteri');
        expect(screen.getByText('Almeno 10 caratteri').closest('li')).toHaveAttribute('data-met', 'false');
        fireEvent.change(field('Password'), { target: { value: STRONG } });
        expect(screen.getByText('Almeno 10 caratteri').closest('li')).toHaveAttribute('data-met', 'true');
        expect(screen.getByText('Un simbolo').closest('li')).toHaveAttribute('data-met', 'true');
    });

    it('lets the user reveal and hide each password field', () => {
        goToSignup();
        expect(field('Password').type).toBe('password');
        fireEvent.click(screen.getAllByRole('button', { name: 'Mostra password' })[0]);
        expect(field('Password').type).toBe('text');
        fireEvent.click(screen.getByRole('button', { name: 'Nascondi password' }));
        expect(field('Password').type).toBe('password');
    });

    it('does not paste-block or disable autofill on the password fields', () => {
        goToSignup();
        expect(field('Password')).toHaveAttribute('autocomplete', 'new-password');
        expect(field('Conferma password')).toHaveAttribute('autocomplete', 'new-password');
        expect(field('Password')).not.toHaveAttribute('onpaste');
    });
});

describe('EmailAuthForm — signin', () => {
    beforeEach(() => {
        mockSignIn.mockReset().mockResolvedValue({});
        window.sessionStorage.clear();
    });

    it('has no confirmation field and does not apply strength rules (legacy passwords still work)', async () => {
        render(<EmailAuthForm />);
        expect(screen.queryByLabelText('Conferma password', { selector: 'input' })).toBeNull();
        fireEvent.change(field('Email'), { target: { value: 'a@b.it' } });
        fireEvent.change(field('Password'), { target: { value: 'abc123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Accedi' }));
        await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({}, 'a@b.it', 'abc123'));
    });

    it('starts empty again after switching mode', () => {
        render(<EmailAuthForm />);
        fireEvent.change(field('Password'), { target: { value: 'secret' } });
        fireEvent.click(screen.getByRole('button', { name: 'Registrati' }));
        expect(field('Password').value).toBe('');
    });

    it('persists brute-force lockout across remounts in sessionStorage', async () => {
        mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
        const { unmount } = render(<EmailAuthForm />);

        for (let i = 0; i < 3; i++) {
            fireEvent.change(field('Email'), { target: { value: 'a@b.it' } });
            fireEvent.change(field('Password'), { target: { value: 'wrong-pass' } });
            fireEvent.click(screen.getByRole('button', { name: 'Accedi' }));
            await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(i + 1));
        }

        expect(await screen.findByText(/Bloccato \(30s\)/)).toBeInTheDocument();

        unmount();
        render(<EmailAuthForm />);
        expect(screen.getByRole('button', { name: /Bloccato \(/ })).toBeDisabled();
    });
});

describe('EmailAuthForm — password reset', () => {
    beforeEach(() => {
        mockSendReset.mockReset().mockResolvedValue(undefined);
        window.sessionStorage.clear();
    });

    async function requestReset(email: string) {
        render(<EmailAuthForm />);
        fireEvent.click(screen.getByRole('button', { name: 'Password dimenticata?' }));
        fireEvent.change(field('Email'), { target: { value: email } });
        fireEvent.click(screen.getByRole('button', { name: 'Invia Email di Reset' }));
    }

    it('shows a neutral confirmation that does not reveal whether the account exists', async () => {
        await requestReset('a@b.it');
        expect(await screen.findByText(/Se l.indirizzo è registrato/)).toBeInTheDocument();
    });

    it('shows the same neutral confirmation when Firebase says the user does not exist', async () => {
        mockSendReset.mockRejectedValue({ code: 'auth/user-not-found' });
        await requestReset('ghost@b.it');
        expect(await screen.findByText(/Se l.indirizzo è registrato/)).toBeInTheDocument();
    });

    it('keeps the confirmation until the user leaves (no auto-redirect after 3s) and offers a way back', async () => {
        jest.useFakeTimers();
        try {
            await requestReset('a@b.it');
            await screen.findByText(/Se l.indirizzo è registrato/);
            jest.advanceTimersByTime(10_000);
            expect(screen.getByText(/Se l.indirizzo è registrato/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: /Torna all.accesso/ }));
            expect(await screen.findByRole('button', { name: 'Accedi' })).toBeInTheDocument();
        } finally {
            jest.useRealTimers();
        }
    });

    it('surfaces real failures such as a network error', async () => {
        mockSendReset.mockRejectedValue({ code: 'auth/network-request-failed' });
        await requestReset('a@b.it');
        expect(await screen.findByText(/Nessuna connessione/)).toBeInTheDocument();
    });
});
