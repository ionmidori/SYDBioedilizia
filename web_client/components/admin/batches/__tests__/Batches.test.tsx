import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { BatchDetail } from '../BatchDetail';
import { BatchList } from '../BatchList';
import { useAdminBatch, useAdminBatches } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';
import type { AdminBatchDetail, AdminBatchListItem } from '@/types/admin-content';

jest.mock('@/hooks/admin/use-admin');
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const mockList = useAdminBatches as jest.MockedFunction<typeof useAdminBatches>;
const mockOne = useAdminBatch as jest.MockedFunction<typeof useAdminBatch>;

function row(overrides: Partial<AdminBatchListItem> = {}): AdminBatchListItem {
  return {
    batch_id: 'b1',
    status: 'submitted',
    client_display_name: 'Mario Rossi',
    client_email: 'mario@example.it',
    total_projects: 2,
    decided_projects: 1,
    batch_grand_total: 1000,
    potential_savings: 50,
    submitted_at: '2026-10-11T10:15:00Z',
    ...overrides,
  };
}

function listState(state: Record<string, unknown>) {
  mockList.mockReturnValue({ isPending: false, isError: false, ...state } as unknown as ReturnType<typeof useAdminBatches>);
}

describe('BatchList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows who sent the batch, how far along it is and how much it is worth', () => {
    listState({ data: { items: [row()] } });
    render(<BatchList />);
    const item = screen.getByTestId('batch-row');
    expect(within(item).getByTestId('batch-client')).toHaveTextContent('Mario Rossi');
    expect(item).toHaveTextContent('mario@example.it');
    expect(within(item).getByTestId('batch-status')).toHaveTextContent('Da revisionare');
    expect(within(item).getByTestId('batch-progress')).toHaveTextContent('1 di 2 preventivi decisi');
    expect(item).toHaveTextContent('1000,00');
    expect(item).toHaveTextContent('risparmio possibile');
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/admin/batches/b1');
  });

  it('switches between open, closed and all batches', () => {
    listState({ data: { items: [] } });
    render(<BatchList />);
    expect(mockList).toHaveBeenLastCalledWith('open');
    fireEvent.click(screen.getByRole('tab', { name: 'Conclusi' }));
    expect(mockList).toHaveBeenLastCalledWith('closed');
    fireEvent.click(screen.getByRole('tab', { name: 'Tutti' }));
    expect(mockList).toHaveBeenLastCalledWith('all');
  });

  it('handles an empty list, loading and errors', () => {
    listState({ data: { items: [] } });
    const { rerender } = render(<BatchList />);
    expect(screen.getByTestId('batch-empty')).toBeInTheDocument();

    listState({ isPending: true, data: undefined });
    rerender(<BatchList />);
    expect(screen.getByLabelText('Caricamento')).toBeInTheDocument();

    listState({ isError: true, data: undefined });
    rerender(<BatchList />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossibile caricare');
  });
});

function detail(overrides: Partial<AdminBatchDetail> = {}): AdminBatchDetail {
  return {
    batch_id: 'b1',
    status: 'partially_approved',
    client_display_name: 'Mario Rossi',
    client_email: 'mario@example.it',
    batch_subtotal: 820,
    batch_grand_total: 1000,
    potential_savings: 150,
    submitted_at: '2026-10-11T10:15:00Z',
    aggregation_preview: [{ adjustment_type: 'merge_quantities', savings: 100 }, { description: 'Sconto cantiere', savings: 50 }],
    projects: [
      { project_id: 'pa', project_name: 'Bagno', batch_status: 'approved', quote_status: 'sent', delivery_status: 'delivered', quote_number: 'PRV-2026-0001', item_count: 3, grand_total: 488 },
      { project_id: 'pb', project_name: 'Cucina', batch_status: 'draft', quote_status: null, delivery_status: 'none', quote_number: null, item_count: 2, grand_total: 0 },
    ],
    ...overrides,
  } as AdminBatchDetail;
}

describe('BatchDetail', () => {
  it('shows totals, the optimisation and the LIVE state of each quote, each leading to its dossier', () => {
    mockOne.mockReturnValue({ isPending: false, isError: false, data: detail() } as unknown as ReturnType<typeof useAdminBatch>);
    render(<BatchDetail batchId="b1" />);
    expect(screen.getByTestId('batch-title')).toHaveTextContent('Mario Rossi');
    const totals = screen.getByTestId('batch-totals');
    expect(totals).toHaveTextContent('1000,00');
    expect(totals).toHaveTextContent('850,00'); // 1000 - 150
    const opt = screen.getByTestId('batch-optimisation');
    expect(opt).toHaveTextContent('Quantità unite');
    expect(opt).toHaveTextContent('Sconto cantiere');

    const [first, second] = screen.getAllByTestId('batch-project');
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/admin/quotes/pa');
    expect(first).toHaveTextContent('PRV-2026-0001');
    expect(within(first).getByTestId('batch-project-status')).toHaveTextContent('Inviato');
    expect(first).toHaveTextContent('Email consegnata');
    expect(within(second).getByTestId('batch-project-missing')).toBeInTheDocument();
    // decisions happen in the dossier: there is no approve/reject button here
    expect(screen.queryByRole('button', { name: /approva|rifiuta/i })).not.toBeInTheDocument();
  });

  it('says so for a missing batch', () => {
    mockOne.mockReturnValue({ isPending: false, isError: true, error: new AdminApiError(404, 'RESOURCE_NOT_FOUND', 'x') } as unknown as ReturnType<typeof useAdminBatch>);
    render(<BatchDetail batchId="nope" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Lotto non trovato');
  });
});
