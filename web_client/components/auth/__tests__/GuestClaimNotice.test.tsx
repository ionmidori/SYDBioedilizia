import { act, fireEvent, render, screen } from '@testing-library/react';
import { GuestClaimNotice } from '../GuestClaimNotice';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';

beforeEach(() => guestClaimStore.reset());

describe('GuestClaimNotice', () => {
    it('shows nothing unless a claim failed', () => {
        render(<GuestClaimNotice />);
        act(() => guestClaimStore.set({ status: 'pending' }));
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('keeps the failure on screen until closed', () => {
        jest.useFakeTimers();
        render(<GuestClaimNotice />);
        act(() => guestClaimStore.set({ status: 'error', message: 'Collegamento scaduto.', retry: null }));
        act(() => { jest.advanceTimersByTime(60_000); });

        expect(screen.getByRole('alert')).toHaveTextContent('Collegamento scaduto.');
        expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
        expect(screen.queryByRole('alert')).toBeNull();
        jest.useRealTimers();
    });

    it('retries when it can help', () => {
        const retry = jest.fn(() => Promise.resolve());
        render(<GuestClaimNotice />);
        act(() => guestClaimStore.set({ status: 'error', message: 'Rete assente.', retry }));

        fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));

        expect(retry).toHaveBeenCalled();
    });
});
