import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { GdprMonitor } from '../GdprMonitor';
import { useGdprStatus, useRunGdprLifecycle } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';

jest.mock('@/hooks/admin/use-admin');
const mockStatus = useGdprStatus as jest.MockedFunction<typeof useGdprStatus>;
const mockRun = useRunGdprLifecycle as jest.MockedFunction<typeof useRunGdprLifecycle>;

const STATUS = {
  phases: [
    { phase: 1, months_inactive: 12, action: 'Email di avviso inattività' },
    { phase: 2, months_inactive: 13, action: 'Account disabilitato' },
    { phase: 3, months_inactive: 24, action: 'Dati personali anonimizzati' },
  ],
  scheduler_secret_configured: true,
};

const RETENTION = {
  orphans_applied: true, guest_sessions: 0, expired_holds: 0, orphans: 0,
  orphans_kept: 0, made_permanent: 0, truncated: false,
};
const RESULT = { status: 'ok', warned: 0, disabled: 0, anonymized: 0, errors: [] as string[], retention: null };

const run = { mutate: jest.fn(), reset: jest.fn(), isPending: false, error: null as unknown, data: undefined as unknown };

function setup(overrides: Record<string, unknown> = {}) {
  mockStatus.mockReturnValue({ isPending: false, isError: false, data: STATUS } as unknown as ReturnType<typeof useGdprStatus>);
  mockRun.mockReturnValue({ ...run, ...overrides } as unknown as ReturnType<typeof useRunGdprLifecycle>);
}

describe('GdprMonitor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('explains the phases and whether the automatic job is configured', () => {
    setup();
    render(<GdprMonitor />);
    const phases = screen.getByTestId('gdpr-phases');
    expect(phases).toHaveTextContent('12 mesi');
    expect(phases).toHaveTextContent('24 mesi');
    expect(phases).toHaveTextContent('Dati personali anonimizzati');
    expect(screen.getByTestId('gdpr-scheduler')).toHaveTextContent('configurato');
  });

  it('warns when the automatic job is not configured', () => {
    mockStatus.mockReturnValue({ isPending: false, isError: false, data: { ...STATUS, scheduler_secret_configured: false } } as unknown as ReturnType<typeof useGdprStatus>);
    mockRun.mockReturnValue(run as unknown as ReturnType<typeof useRunGdprLifecycle>);
    render(<GdprMonitor />);
    expect(screen.getByTestId('gdpr-scheduler')).toHaveTextContent('NON è configurato');
  });

  it('never runs without an explicit confirmation that says what it does', () => {
    setup();
    render(<GdprMonitor />);
    fireEvent.click(screen.getByTestId('gdpr-run'));
    expect(run.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('non si possono annullare');
    fireEvent.click(screen.getByTestId('gdpr-confirm'));
    expect(run.mutate).toHaveBeenCalledTimes(1);
  });

  it('shows the outcome per phase and the (sanitised) errors', () => {
    setup({ data: { ...RESULT, status: 'partial_errors', warned: 3, disabled: 1, errors: ['warn: 2 errori (dettagli nei log del server)'] } });
    render(<GdprMonitor />);
    const result = screen.getByTestId('gdpr-result');
    expect(result).toHaveTextContent('errori parziali');
    expect(result).toHaveTextContent('3');
    expect(screen.getByTestId('gdpr-errors')).toHaveTextContent('warn: 2 errori');
  });

  it('shows what the retention phase erased', () => {
    setup({ data: { ...RESULT, retention: { ...RETENTION, guest_sessions: 7, orphans: 2 } } });
    render(<GdprMonitor />);
    const retention = screen.getByTestId('gdpr-retention');
    expect(retention).toHaveTextContent('Sessioni ospite');
    expect(retention).toHaveTextContent('7');
    expect(retention).not.toHaveTextContent('Simulazione');
  });

  it('makes clear that orphans are only counted while their purge is off', () => {
    setup({ data: { ...RESULT, retention: { ...RETENTION, orphans_applied: false, orphans: 36, orphans_kept: 2, truncated: true } } });
    render(<GdprMonitor />);
    const retention = screen.getByTestId('gdpr-retention');
    expect(retention).toHaveTextContent('Residui orfani: solo conteggiati');
    expect(retention).toHaveTextContent('36');
    expect(retention).toHaveTextContent('2 residui di account registrati');
    expect(retention).toHaveTextContent('prossima esecuzione');
  });

  it('says when the retention phase failed', () => {
    setup({ data: { ...RESULT, status: 'partial_errors', errors: ['retention: 1 errori (dettagli nei log del server)'] } });
    render(<GdprMonitor />);
    expect(screen.getByTestId('gdpr-retention')).toHaveTextContent('non è stata eseguita');
  });

  it('shows no retention section when the backend did not report one and nothing failed', () => {
    // A backend older than this page (during a release) sends no summary: not an error.
    setup({ data: RESULT });
    render(<GdprMonitor />);
    expect(screen.queryByTestId('gdpr-retention')).not.toBeInTheDocument();
  });

  it('tells the admin that a pass is already running', () => {
    setup({ error: new AdminApiError(409, 'LIFECYCLE_ALREADY_RUNNING', 'x') });
    render(<GdprMonitor />);
    expect(screen.getByTestId('error-banner')).toHaveTextContent('già in corso');
  });

  it('shows progress while running', () => {
    setup({ isPending: true });
    render(<GdprMonitor />);
    expect(screen.getByTestId('gdpr-run')).toBeDisabled();
    expect(screen.getByText(/fino a un minuto/)).toBeInTheDocument();
  });
});
