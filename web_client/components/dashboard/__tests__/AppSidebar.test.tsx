import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AppSidebar } from '../AppSidebar';

jest.mock('next/navigation', () => ({
    usePathname: () => '/dashboard',
    useRouter: () => ({ push: jest.fn() }),
    useSearchParams: () => ({ get: () => null }),
}));
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'u1', displayName: 'Ada', email: 'ada@example.com' }, logout: jest.fn() }),
}));
jest.mock('@/components/dashboard/SidebarProvider', () => ({
    useSidebar: () => ({
        state: 'expanded', open: true, toggleSidebar: jest.fn(), isMobile: false, openMobile: false, setOpenMobile: jest.fn(),
    }),
}));

describe('AppSidebar — the house, not a list of projects (Phase 139)', () => {
    it('links the house, its gallery and its quotes', () => {
        render(<AppSidebar />);

        expect(screen.getByRole('link', { name: 'Casa' })).toHaveAttribute('href', '/dashboard');
        expect(screen.getByRole('link', { name: 'Galleria' })).toHaveAttribute('href', '/dashboard/gallery');
        expect(screen.getByRole('link', { name: 'Preventivi' })).toHaveAttribute('href', '/dashboard/quotes');
        expect(screen.queryByText('Progetti')).not.toBeInTheDocument();
        expect(screen.queryByText('Cantiere Attivo')).not.toBeInTheDocument();
    });
});
