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
let mockSidebarState = {
    state: 'expanded' as 'expanded' | 'collapsed',
    open: true,
    toggleSidebar: jest.fn(),
    isMobile: false,
    openMobile: false,
    setOpenMobile: jest.fn(),
};

jest.mock('@/components/dashboard/SidebarProvider', () => ({
    useSidebar: () => mockSidebarState,
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockSidebarState = {
        state: 'expanded',
        open: true,
        toggleSidebar: jest.fn(),
        isMobile: false,
        openMobile: false,
        setOpenMobile: jest.fn(),
    };
});

describe('AppSidebar — the house, not a list of projects (Phase 139)', () => {
    it('links the house, its gallery and its quotes', () => {
        render(<AppSidebar />);

        expect(screen.getByRole('link', { name: 'Casa' })).toHaveAttribute('href', '/dashboard');
        expect(screen.getByRole('link', { name: 'Galleria' })).toHaveAttribute('href', '/dashboard/gallery');
        expect(screen.getByRole('link', { name: 'Preventivi' })).toHaveAttribute('href', '/dashboard/quotes');
        expect(screen.queryByText('Progetti')).not.toBeInTheDocument();
        expect(screen.queryByText('Cantiere Attivo')).not.toBeInTheDocument();
    });

    it('renders the mobile trigger notch at z-[85] below open floating chat (z-[100])', () => {
        mockSidebarState.isMobile = true;
        mockSidebarState.openMobile = false;

        render(<AppSidebar />);

        const notch = screen.getByRole('button', { name: 'Toggle sidebar' });
        expect(notch).toHaveClass('z-[85]');
        expect(notch).not.toHaveClass('z-[115]');
    });

    it('renders the mobile drawer backdrop at z-[115] beneath the drawer panel (!z-[120]) when open', () => {
        mockSidebarState.isMobile = true;
        mockSidebarState.openMobile = true;

        const { container } = render(<AppSidebar />);

        const backdrop = container.querySelector('.fixed.inset-0[aria-hidden="true"]');
        expect(backdrop).toBeInTheDocument();
        expect(backdrop).toHaveClass('z-[115]');
        expect(backdrop).not.toHaveClass('z-[99]');

        const drawerPanel = screen.getByRole('button', { name: 'Chiudi menu laterale' }).closest('[data-state]');
        expect(drawerPanel).toBeInTheDocument();
        expect(drawerPanel).toHaveClass('!z-[120]');
    });
});
