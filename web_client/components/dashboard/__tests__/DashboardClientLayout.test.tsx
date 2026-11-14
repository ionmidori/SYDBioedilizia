import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardClientLayout } from '../DashboardClientLayout';

const mockPush = jest.fn();
const mockLogout = jest.fn(async () => {});
let mockAuthState: {
    user: { uid: string; isAnonymous: boolean } | null;
    isInitialized: boolean;
    logout: () => Promise<void>;
} = {
    user: null,
    isInitialized: true,
    logout: mockLogout,
};

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockAuthState,
}));
jest.mock('@/hooks/useInactivityLogout', () => ({
    useInactivityLogout: () => ({ showWarning: false, secondsRemaining: 0, extendSession: jest.fn() }),
}));
jest.mock('@/components/auth/InactivityWarningDialog', () => ({
    InactivityWarningDialog: () => null,
}));
jest.mock('@/components/dashboard/SidebarProvider', () => ({
    SidebarProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-shell">{children}</div>,
}));
jest.mock('@/components/mobile/MobileSwipeLayout', () => ({
    MobileSwipeLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/dashboard/AppSidebar', () => ({
    AppSidebar: () => null,
}));
jest.mock('@/components/dashboard/DashboardHeader', () => ({
    DashboardHeader: () => null,
}));
jest.mock('@/components/dashboard/OnboardingTour', () => ({
    OnboardingTour: () => null,
}));
jest.mock('@/components/ui/ScallopedPageTransition', () => ({
    ScallopedPageTransition: () => <div data-testid="loading-transition" />,
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('DashboardClientLayout', () => {
    it('redirects anonymous users to / and hides dashboard children', async () => {
        mockAuthState = {
            user: { uid: 'anon-1', isAnonymous: true },
            isInitialized: true,
            logout: mockLogout,
        };

        render(
            <DashboardClientLayout>
                <div data-testid="dashboard-content">Secret</div>
            </DashboardClientLayout>,
        );

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
        expect(screen.queryByTestId('dashboard-content')).not.toBeInTheDocument();
        expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
        expect(screen.getByTestId('loading-transition')).toBeInTheDocument();
    });

    it('renders children for signed-in non-anonymous users', () => {
        mockAuthState = {
            user: { uid: 'user-1', isAnonymous: false },
            isInitialized: true,
            logout: mockLogout,
        };

        render(
            <DashboardClientLayout>
                <div data-testid="dashboard-content">Workspace</div>
            </DashboardClientLayout>,
        );

        expect(mockPush).not.toHaveBeenCalled();
        expect(screen.getByTestId('dashboard-shell')).toBeInTheDocument();
        expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });
});
