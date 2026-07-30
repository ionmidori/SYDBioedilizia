import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Testimonials } from '@/components/sections/Testimonials';

const mockUseAuth = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

const mockFetchWithAuth = jest.fn();
jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}));

const registeredUser = {
    uid: 'user-1',
    isAnonymous: false,
    displayName: 'Marco Rossi',
};

async function openReviewDialog() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Lascia una recensione/i }));
    return user;
}

describe('Testimonials review form', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseAuth.mockReturnValue({ user: registeredUser });
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    });

    it('offers name and location fields with visible labels', async () => {
        render(<Testimonials />);
        await openReviewDialog();

        expect(screen.getByLabelText('Nome')).toBeInTheDocument();
        expect(screen.getByLabelText('Località')).toBeInTheDocument();
        expect(screen.getByLabelText('La tua recensione')).toBeInTheDocument();
    });

    it('prefills the name field from the account on open', async () => {
        render(<Testimonials />);
        await openReviewDialog();

        expect(screen.getByLabelText('Nome')).toHaveValue('Marco Rossi');
    });

    it('shows a visible error instead of doing nothing when the submit fails', async () => {
        mockFetchWithAuth.mockResolvedValue({ ok: false });
        render(<Testimonials />);
        const user = await openReviewDialog();

        await user.type(screen.getByLabelText('Località'), 'Milano');
        await user.type(
            screen.getByLabelText('La tua recensione'),
            'Esperienza fantastica dall inizio alla fine.',
        );
        await user.click(screen.getByRole('button', { name: 'Invia Recensione' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/non riuscito/i);
        // The success panel never replaces the form on a failed submit.
        expect(screen.queryByText('Grazie!')).not.toBeInTheDocument();
    });

    it('sends name and location in the submit payload', async () => {
        mockFetchWithAuth.mockResolvedValue({ ok: true });
        render(<Testimonials />);
        const user = await openReviewDialog();

        await user.clear(screen.getByLabelText('Nome'));
        await user.type(screen.getByLabelText('Nome'), 'Giulia Verdi');
        await user.type(screen.getByLabelText('Località'), 'Firenze');
        await user.type(
            screen.getByLabelText('La tua recensione'),
            'Team professionale e puntuale su ogni fase.',
        );
        await user.click(screen.getByRole('button', { name: 'Invia Recensione' }));

        await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalled());
        const [, options] = mockFetchWithAuth.mock.calls[0];
        const body = JSON.parse(options.body as string);
        expect(body.name).toBe('Giulia Verdi');
        expect(body.location).toBe('Firenze');
    });

    it('resets a stale success panel when the dialog is reopened', async () => {
        mockFetchWithAuth.mockResolvedValue({ ok: true });
        render(<Testimonials />);
        const user = await openReviewDialog();

        await user.type(screen.getByLabelText('Località'), 'Milano');
        await user.type(
            screen.getByLabelText('La tua recensione'),
            'Esperienza fantastica dall inizio alla fine.',
        );
        await user.click(screen.getByRole('button', { name: 'Invia Recensione' }));

        expect(await screen.findByText('Grazie!')).toBeInTheDocument();

        // Close without waiting for the auto-close timeout, then reopen.
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByText('Grazie!')).not.toBeInTheDocument());

        await openReviewDialog();
        expect(screen.queryByText('Grazie!')).not.toBeInTheDocument();
        expect(screen.getByLabelText('La tua recensione')).toHaveValue('');
    });
});
