import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { parseCc, SendDialog } from '../SendDialog';
import { useRegeneratePdf, useSendDefaults, useSendQuote } from '@/hooks/admin/use-admin';
import type { SendDefaults } from '@/types/admin-quote';

jest.mock('@/hooks/admin/use-admin');
const mockDefaults = useSendDefaults as jest.MockedFunction<typeof useSendDefaults>;
const mockSend = useSendQuote as jest.MockedFunction<typeof useSendQuote>;
const mockRegenerate = useRegeneratePdf as jest.MockedFunction<typeof useRegeneratePdf>;

const DEFAULTS: SendDefaults = {
  to: 'mario@example.it',
  to_source: 'snapshot',
  subject: 'Bozza di preventivo PRV-2026-0001 – SYD Bioedilizia',
  body_preview: 'Gentile Mario Rossi, in allegato la bozza.',
  attachment_name: 'Bozza_preventivo_PRV-2026-0001.pdf',
  revision: 2,
  pdf_ready: true,
};

function setup(defaults: Partial<SendDefaults> = {}) {
  mockDefaults.mockReturnValue({
    isPending: false,
    isError: false,
    data: { ...DEFAULTS, ...defaults },
  } as unknown as ReturnType<typeof useSendDefaults>);
  const mutate = jest.fn();
  mockSend.mockReturnValue({ mutate, isPending: false, error: null } as unknown as ReturnType<typeof useSendQuote>);
  mockRegenerate.mockReturnValue({ mutate: jest.fn(), isPending: false, error: null } as unknown as ReturnType<
    typeof useRegeneratePdf
  >);
  const onSent = jest.fn();
  render(<SendDialog projectId="p1" open onOpenChange={jest.fn()} onSent={onSent} />);
  return { mutate, onSent };
}

describe('parseCc', () => {
  it('splits on commas, semicolons and spaces', () => {
    expect(parseCc(' a@x.it, b@y.it;c@z.it  ')).toEqual(['a@x.it', 'b@y.it', 'c@z.it']);
    expect(parseCc('')).toEqual([]);
  });
});

describe('SendDialog', () => {
  it('pre-fills recipient and subject and sends them untouched', async () => {
    const { mutate } = setup();
    expect(screen.getByTestId('send-to')).toHaveValue('mario@example.it');
    expect(screen.getByTestId('send-subject')).toHaveValue(DEFAULTS.subject);
    expect(screen.getByText(DEFAULTS.attachment_name)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('send-confirm'));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [vars] = mutate.mock.calls[0];
    expect(vars.body).toEqual({ to: 'mario@example.it', cc: [], subject: DEFAULTS.subject, message: null });
    expect(vars.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lets the admin change the recipient, add cc and a personal note', async () => {
    const { mutate } = setup();
    fireEvent.change(screen.getByTestId('send-to'), { target: { value: 'altro@example.it' } });
    fireEvent.change(screen.getByTestId('send-cc'), { target: { value: 'a@x.it, b@y.it' } });
    fireEvent.change(screen.getByTestId('send-message'), { target: { value: ' Ci sentiamo lunedì ' } });
    fireEvent.click(screen.getByTestId('send-confirm'));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].body).toMatchObject({
      to: 'altro@example.it',
      cc: ['a@x.it', 'b@y.it'],
      message: 'Ci sentiamo lunedì',
    });
  });

  it('blocks an invalid recipient and more than 3 cc', () => {
    setup();
    fireEvent.change(screen.getByTestId('send-to'), { target: { value: 'non-una-email' } });
    expect(screen.getByTestId('send-confirm')).toBeDisabled();
    expect(screen.getByText('Indirizzo email non valido.')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('send-to'), { target: { value: 'ok@example.it' } });
    fireEvent.change(screen.getByTestId('send-cc'), { target: { value: 'a@x.it b@x.it c@x.it d@x.it' } });
    expect(screen.getByTestId('send-confirm')).toBeDisabled();
    expect(screen.getByText('Massimo 3 indirizzi email validi.')).toBeInTheDocument();
  });

  it('asks for the email when the client left none', () => {
    setup({ to: null, to_source: 'none' });
    expect(screen.getByTestId('send-to')).toHaveValue('');
    expect(screen.getByText(/inseriscila a mano/)).toBeInTheDocument();
    expect(screen.getByTestId('send-confirm')).toBeDisabled();
  });

  it('will not send while the PDF of the approved revision is missing', () => {
    setup({ pdf_ready: false });
    expect(screen.getByTestId('send-confirm')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rigenera il PDF' })).toBeInTheDocument();
  });
});
