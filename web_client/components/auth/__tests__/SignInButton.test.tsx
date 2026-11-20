import { fireEvent, render, screen } from '@testing-library/react';
import { SignInButton } from '@/components/auth/SignInButton';

type AuthState = {
    user: { displayName: string | null; photoURL: string | null; isAnonymous: boolean } | null;
    loading: boolean;
    logout: jest.Mock;
    isAdmin?: boolean;
};

let mockAuth: AuthState;

jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockAuth,
}));
jest.mock('@/components/auth/AuthDialog', () => ({
    AuthDialog: () => null,
}));
jest.mock('next/image', () => ({
    __esModule: true,
    // `fill` is a next/image-only prop: keep it off the DOM <img>.
    default: (props: Record<string, unknown>) => {
        const imgProps = Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'fill'));
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        return <img {...imgProps} />;
    },
}));

const registered = (overrides: Partial<NonNullable<AuthState['user']>> = {}) => ({
    displayName: 'Ada Lovelace',
    photoURL: null,
    isAnonymous: false,
    ...overrides,
});

beforeEach(() => {
    mockAuth = { user: registered(), loading: false, logout: jest.fn() };
});

describe('SignInButton', () => {
    it('shows a disabled placeholder while auth is loading', () => {
        mockAuth = { user: null, loading: true, logout: jest.fn() };
        render(<SignInButton />);
        expect(screen.getByRole('button', { name: 'Caricamento...' })).toBeDisabled();
        expect(screen.queryByRole('link', { name: 'Console Admin' })).not.toBeInTheDocument();
    });

    it.each([
        ['signed out', null],
        ['anonymous', registered({ isAnonymous: true })],
    ])('offers "Accedi" and no admin link when %s', (_label, user) => {
        mockAuth = { user, loading: false, logout: jest.fn(), isAdmin: true };
        render(<SignInButton onLoginClick={jest.fn()} />);
        expect(screen.getByRole('button', { name: /Accedi/ })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Console Admin' })).not.toBeInTheDocument();
    });

    it('keeps the profile link and logout, with no admin link, for a regular user', () => {
        mockAuth = { user: registered(), loading: false, logout: jest.fn(), isAdmin: false };
        render(<SignInButton />);
        expect(screen.getByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/dashboard/profile');
        expect(screen.getByRole('button', { name: "Esci dall'account" })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Console Admin' })).not.toBeInTheDocument();
    });

    it('does not break when the auth mock has no isAdmin at all (defaults to false)', () => {
        render(<SignInButton />);
        expect(screen.getByRole('link', { name: /Ada/ })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Console Admin' })).not.toBeInTheDocument();
    });

    describe('for an admin', () => {
        beforeEach(() => {
            mockAuth = { user: registered(), loading: false, logout: jest.fn(), isAdmin: true };
        });

        it('links the console to /admin, next to logout, without breaking the profile link', () => {
            render(<SignInButton />);
            const admin = screen.getByRole('link', { name: 'Console Admin' });
            expect(admin).toHaveAttribute('href', '/admin');
            expect(admin).toHaveAttribute('title', 'Console Admin');
            expect(admin.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
            expect(screen.getByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/dashboard/profile');
            expect(screen.getByRole('button', { name: "Esci dall'account" })).toBeInTheDocument();
        });

        it('calls onNavigate from both the admin link and the profile link', () => {
            const onNavigate = jest.fn();
            render(<SignInButton onNavigate={onNavigate} />);

            fireEvent.click(screen.getByRole('link', { name: 'Console Admin' }));
            expect(onNavigate).toHaveBeenCalledTimes(1);

            fireEvent.click(screen.getByRole('link', { name: /Ada/ }));
            expect(onNavigate).toHaveBeenCalledTimes(2);
        });

        it('does not call onNavigate when logging out', () => {
            const onNavigate = jest.fn();
            render(<SignInButton onNavigate={onNavigate} />);
            fireEvent.click(screen.getByRole('button', { name: "Esci dall'account" }));
            expect(mockAuth.logout).toHaveBeenCalledTimes(1);
            expect(onNavigate).not.toHaveBeenCalled();
        });
    });
});
