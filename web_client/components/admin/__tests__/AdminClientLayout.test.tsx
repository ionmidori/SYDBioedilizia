import React from 'react';
import { render, screen } from '@testing-library/react';

import { AdminClientLayout } from '../AdminClientLayout';
import { useAdminMe } from '@/hooks/admin/use-admin';
import { useAuth } from '@/hooks/useAuth';
import { AdminApiError } from '@/lib/admin/admin-api';

jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/admin/use-admin');
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
jest.mock('@/components/ui/ScallopedPageTransition', () => ({
  ScallopedPageTransition: () => <div data-testid="loader" />,
}));

const mockAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockMe = useAdminMe as jest.MockedFunction<typeof useAdminMe>;

function auth(user: object | null, isInitialized = true) {
  mockAuth.mockReturnValue({ user, isInitialized, logout: jest.fn() } as unknown as ReturnType<typeof useAuth>);
}

function me(state: Record<string, unknown>) {
  mockMe.mockReturnValue({ isPending: false, isError: false, ...state } as unknown as ReturnType<typeof useAdminMe>);
}

function renderShell() {
  return render(
    <AdminClientLayout>
      <p>contenuto riservato</p>
    </AdminClientLayout>,
  );
}

describe('AdminClientLayout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows nothing of the console until the backend confirms the role', () => {
    auth({ uid: 'u' });
    me({ isPending: true });
    renderShell();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByText('contenuto riservato')).not.toBeInTheDocument();
  });

  it('sends signed-out visitors home', () => {
    auth(null);
    me({ isPending: true });
    renderShell();
    expect(replace).toHaveBeenCalledWith('/');
    expect(screen.queryByText('contenuto riservato')).not.toBeInTheDocument();
  });

  it('refuses non-admins with an explanation, never the content', () => {
    auth({ uid: 'u' });
    me({ isError: true, error: new AdminApiError(403, 'ADMIN_REQUIRED', 'no') });
    renderShell();
    expect(screen.getByTestId('admin-access-denied')).toHaveTextContent('Accesso riservato');
    expect(screen.queryByText('contenuto riservato')).not.toBeInTheDocument();
  });

  it('distinguishes an outage from a denial', () => {
    auth({ uid: 'u' });
    me({ isError: true, error: new AdminApiError(502, 'HTTP_502', 'down') });
    renderShell();
    expect(screen.getByTestId('admin-access-denied')).toHaveTextContent('Console non raggiungibile');
  });

  it('renders the console for a confirmed admin', () => {
    auth({ uid: 'u' });
    me({ data: { uid: 'u', email: 'admin@syd.it', role: 'admin', mfa: false } });
    renderShell();
    expect(screen.getByText('contenuto riservato')).toBeInTheDocument();
    expect(screen.getByTestId('admin-email')).toHaveTextContent('admin@syd.it');
  });
});
