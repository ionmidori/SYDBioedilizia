import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { DossierChat } from '../DossierChat';
import * as hooks from '@/hooks/admin/use-admin';
import type { AdminChat, AdminChatMessage } from '@/types/admin-quote';

jest.mock('@/hooks/admin/use-admin');

const m = hooks as jest.Mocked<typeof hooks>;

function message(id: string, overrides: Partial<AdminChatMessage> = {}): AdminChatMessage {
  return {
    id,
    role: 'user',
    text: `testo ${id}`,
    at: '2026-11-19T09:00:00Z',
    room_label: null,
    has_media: false,
    in_change: false,
    ...overrides,
  };
}

function setup(state: Record<string, unknown>) {
  m.useAdminChat.mockReturnValue({ isPending: false, isError: false, refetch: jest.fn(), ...state } as unknown as ReturnType<
    typeof m.useAdminChat
  >);
  return render(<DossierChat projectId="p1" />);
}

function chat(overrides: Partial<AdminChat> = {}): AdminChat {
  return { messages: [], change_kind: null, change_since: null, truncated: false, ...overrides };
}

describe('DossierChat', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the change first and keeps the older chat collapsed', () => {
    setup({
      data: chat({
        change_kind: 'followup',
        change_since: '2026-11-19T10:00:00Z',
        messages: [
          message('old'),
          message('new', { text: 'aggiungo la cucina', in_change: true, room_label: 'Cucina', has_media: true }),
          message('reply', { role: 'assistant', text: 'ho inviato al team la richiesta', in_change: true }),
        ],
      }),
    });

    const change = screen.getByTestId('chat-change');
    expect(within(change).getByText(/Modifica richiesta dal/)).toBeInTheDocument();
    expect(within(change).getByText('aggiungo la cucina')).toBeInTheDocument();
    expect(within(change).getByText('Cucina')).toBeInTheDocument();
    expect(within(change).getByText('Foto allegate')).toBeInTheDocument();
    expect(within(change).getByText('SYD')).toBeInTheDocument();
    expect(screen.queryByText('testo old')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /chat precedente \(1 messaggio\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('testo old')).toBeInTheDocument();
  });

  it('is the target of the follow-up banner link', () => {
    const { container } = setup({ data: chat({ messages: [message('m1')] }) });
    expect(container.querySelector('#chat-cliente')).not.toBeNull();
  });

  it('shows the whole chat with a note when the start of the change is unknown', () => {
    setup({ data: chat({ change_kind: 'followup', change_since: null, messages: [message('m1'), message('m2')] }) });
    expect(screen.getByTestId('chat-change-unknown')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-change')).not.toBeInTheDocument();
    expect(screen.getByText('testo m1')).toBeInTheDocument();
    expect(screen.getByText('testo m2')).toBeInTheDocument();
  });

  it('shows the whole chat when no change is pending', () => {
    setup({ data: chat({ messages: [message('m1')] }) });
    expect(screen.queryByTestId('chat-change')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-change-unknown')).not.toBeInTheDocument();
    expect(screen.getByText('testo m1')).toBeInTheDocument();
  });

  it('says when older messages were left out', () => {
    setup({ data: chat({ messages: [message('m1')], truncated: true }) });
    expect(screen.getByTestId('chat-truncated')).toBeInTheDocument();
  });

  it('says when the chat is empty', () => {
    setup({ data: chat() });
    expect(screen.getByText('Nessun messaggio in chat.')).toBeInTheDocument();
  });

  it('keeps the chat it read when a later refresh fails', () => {
    setup({ isError: true, data: chat({ messages: [message('m1')] }) });
    expect(screen.getByText('testo m1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument();
  });

  it('offers a retry when the chat cannot be read', () => {
    const refetch = jest.fn();
    setup({ isError: true, refetch });
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(refetch).toHaveBeenCalled();
  });
});
