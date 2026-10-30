import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DashboardHeader } from '../DashboardHeader';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockPathname = '/dashboard';
let mockView: string | null = null;
jest.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
    useSearchParams: () => ({ get: (key: string) => (key === 'view' ? mockView : null) }),
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock('@/components/branding/SydLogo', () => ({ SydLogo: () => <span /> }));

const tabNames = () => screen.getAllByRole('button', { name: /^Vai a / }).map((b) => b.getAttribute('aria-label'));

beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
    mockView = null;
});

describe('DashboardHeader (mobile) — the house, its gallery, its quotes (Phase 139)', () => {
    it('has the sections Casa, Galleria, Preventivi and, in the house, its four tabs', () => {
        render(<DashboardHeader />);

        expect(tabNames()).toEqual([
            'Vai a Casa', 'Vai a Galleria', 'Vai a Preventivi',
            'Vai a Chat', 'Vai a Media', 'Vai a Preventivo', 'Vai a Casa',
        ]);
        expect(screen.queryByText(/Progetti/)).not.toBeInTheDocument();
    });

    it('opens a tab of the house through the address', async () => {
        mockView = 'media';
        render(<DashboardHeader />);
        expect(screen.getByText('Media')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Vai a Media' })).toHaveAttribute('aria-current', 'page');

        await userEvent.click(screen.getByRole('button', { name: 'Vai a Preventivo' }));

        expect(mockReplace).toHaveBeenCalledWith('/dashboard?view=quote', { scroll: false });
    });

    it('goes to the quotes, with no house tabs there', async () => {
        render(<DashboardHeader />);
        await userEvent.click(screen.getByRole('button', { name: 'Vai a Preventivi' }));
        expect(mockPush).toHaveBeenCalledWith('/dashboard/quotes');

        mockPathname = '/dashboard/quotes';
        render(<DashboardHeader />);
        expect(screen.getAllByRole('button', { name: 'Vai a Chat' })).toHaveLength(1);
    });
});
