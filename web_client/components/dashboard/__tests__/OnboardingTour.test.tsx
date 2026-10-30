import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { OnboardingTour } from '../OnboardingTour';

const KEY = 'syd_house_tour_completed';

function onPhone(width = 390) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

async function showTour() {
    render(<OnboardingTour />);
    await act(async () => { jest.advanceTimersByTime(1500); });
}

beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    onPhone();
});
afterEach(() => jest.useRealTimers());

describe('OnboardingTour — the house (Phase 139)', () => {
    it('shows the house in two steps, then never again', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        await showTour();

        expect(screen.getByRole('dialog')).toHaveTextContent('una sola chat per tutte le stanze');
        await user.click(screen.getByRole('button', { name: /Avanti/ }));
        expect(screen.getByRole('dialog')).toHaveTextContent('Chat, Media, Preventivo e Casa');
        await user.click(screen.getByRole('button', { name: /Inizia/ }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(localStorage.getItem(KEY)).toBe('true');
    });

    it('can be skipped', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        await showTour();

        await user.click(screen.getByRole('button', { name: 'Salta' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(localStorage.getItem(KEY)).toBe('true');
    });

    it('is shown to whoever saw the old tour of the projects', async () => {
        localStorage.setItem('syd_dashboard_tour_completed', 'true');
        await showTour();

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('is not shown again, nor on a desktop (the tabs are on screen there)', async () => {
        localStorage.setItem(KEY, 'true');
        await showTour();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        localStorage.clear();
        onPhone(1280);
        await showTour();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('never mentions projects or swiping', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        await showTour();
        const seen = [screen.getByRole('dialog').textContent];
        await user.click(screen.getByRole('button', { name: /Avanti/ }));
        seen.push(screen.getByRole('dialog').textContent);

        expect(seen.join(' ')).not.toMatch(/progett|swipe|scorri/i);
    });
});
