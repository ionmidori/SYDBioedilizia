import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { KpiDashboard, summarize } from '../KpiDashboard';
import { WeeklyBars } from '../WeeklyBars';
import { useAdminKpis } from '@/hooks/admin/use-admin';
import type { AdminKpis } from '@/types/admin-content';

jest.mock('@/hooks/admin/use-admin');
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const mockKpis = useAdminKpis as jest.MockedFunction<typeof useAdminKpis>;

const WEEKS = Array.from({ length: 8 }, (_, i) => ({ week_start: `2026-08-${String(10 + i * 7).padStart(2, '0')}`, approvals: i === 7 ? 3 : 0 }));

function kpis(overrides: Partial<AdminKpis> = {}): AdminKpis {
  return {
    by_status: { draft: 2, pending_review: 3, in_review: 1, approved: 2, sent: 4, rejected: 5 },
    pending_value: 12345.5,
    pending_truncated: false,
    weekly_approvals: WEEKS,
    recent_approvals: [
      { project_id: 'p1', quote_number: 'PRV-2026-0004', client_display_name: 'Mario Rossi', grand_total: 488 },
    ],
    testimonials: { pending: 2, approved: 7, rejected: 1 },
    generated_at: '2026-10-14T12:00:00Z',
    ...overrides,
  };
}

function load(data: AdminKpis, extra: Record<string, unknown> = {}) {
  mockKpis.mockReturnValue({ isPending: false, isError: false, isFetching: false, data, refetch: jest.fn(), ...extra } as unknown as ReturnType<typeof useAdminKpis>);
}

describe('summarize', () => {
  it('folds the statuses like the old dashboard: work to do, approved (incl. sent), rejected', () => {
    expect(summarize(kpis())).toEqual({ toWork: 4, approved: 6, rejected: 5, drafts: 2, sent: 4 });
    expect(summarize(kpis({ by_status: {} }))).toEqual({ toWork: 0, approved: 0, rejected: 0, drafts: 0, sent: 0 });
  });
});

describe('KpiDashboard', () => {
  it('shows the numbers an admin opens the console for', () => {
    load(kpis());
    render(<KpiDashboard />);
    expect(screen.getByTestId('kpi-to-work')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-pending-value')).toHaveTextContent('12.345,50');
    expect(screen.getByTestId('kpi-approved')).toHaveTextContent('6');
    expect(screen.getByTestId('kpi-rejected')).toHaveTextContent('5');
    expect(screen.getByTestId('kpi-reviews')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-drafts')).toHaveTextContent('2 bozze');
  });

  it('lists the latest approvals with a link to each dossier', () => {
    load(kpis());
    render(<KpiDashboard />);
    const link = within(screen.getByTestId('recent-approvals')).getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/quotes/p1');
    expect(link).toHaveTextContent('PRV-2026-0004');
    expect(link).toHaveTextContent('Mario Rossi');
  });

  it('says so when the sum is partial', () => {
    load(kpis({ pending_truncated: true }));
    render(<KpiDashboard />);
    expect(screen.getByText(/somma parziale/)).toBeInTheDocument();
  });

  it('shows an empty-state message instead of a flat chart', () => {
    load(kpis({ weekly_approvals: WEEKS.map((w) => ({ ...w, approvals: 0 })), recent_approvals: [] }));
    render(<KpiDashboard />);
    expect(screen.queryByTestId('weekly-bars')).not.toBeInTheDocument();
    expect(screen.getByText(/Nessun preventivo approvato in queste settimane/)).toBeInTheDocument();
    expect(screen.getByText('Nessun preventivo approvato.')).toBeInTheDocument();
  });

  it('refreshes on demand and reports loading and failures', () => {
    const refetch = jest.fn();
    load(kpis(), { refetch });
    const { rerender } = render(<KpiDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /Aggiorna/ }));
    expect(refetch).toHaveBeenCalled();

    mockKpis.mockReturnValue({ isPending: true } as unknown as ReturnType<typeof useAdminKpis>);
    rerender(<KpiDashboard />);
    expect(screen.getByLabelText('Caricamento')).toBeInTheDocument();

    mockKpis.mockReturnValue({ isPending: false, isError: true } as unknown as ReturnType<typeof useAdminKpis>);
    rerender(<KpiDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossibile caricare');
  });
});

describe('WeeklyBars', () => {
  it('draws a bar per week and also exposes the numbers as a table', () => {
    render(<WeeklyBars weeks={WEEKS} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('3 in totale'));
    expect(document.querySelectorAll('svg rect')).toHaveLength(8);
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });
});
