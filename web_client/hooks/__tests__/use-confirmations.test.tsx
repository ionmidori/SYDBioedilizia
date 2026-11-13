import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConfirmationMutation, useConfirmations } from '../use-confirmations';
import { confirmationsApi } from '@/lib/confirmations-api';

jest.mock('@/lib/confirmations-api', () => ({
  confirmationsApi: { getState: jest.fn(), confirm: jest.fn() },
}));
const getState = confirmationsApi.getState as jest.Mock;
const confirm = confirmationsApi.confirm as jest.Mock;

const STATE = { sections: [], editable: true, precision: null };

function wrapperWith(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getState.mockReset();
  confirm.mockReset();
});

describe('useConfirmations', () => {
  it('asks for nothing without a project', () => {
    renderHook(() => useConfirmations(null), {
      wrapper: wrapperWith(new QueryClient()),
    });

    expect(getState).not.toHaveBeenCalled();
  });

  it('reads the state of the project', async () => {
    getState.mockResolvedValue(STATE);
    const { result } = renderHook(() => useConfirmations('chat-1'), {
      wrapper: wrapperWith(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
    });

    await waitFor(() => expect(result.current.data).toEqual(STATE));
    expect(getState).toHaveBeenCalledWith('chat-1');
  });
});

describe('useConfirmationMutation', () => {
  it('confirms a section, then reads the card and the quote again', async () => {
    confirm.mockResolvedValue({
      recalculated: true,
      blocked_sections: [],
      state: STATE,
    });
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useConfirmationMutation('chat-1'), {
      wrapper: wrapperWith(client),
    });
    const update = {
      measures: [{ name: 'mq', value: 6 }],
      element_choices: [],
    };

    await act(() => result.current.mutateAsync({ sectionKey: 'bagno1', update }));

    expect(confirm).toHaveBeenCalledWith('chat-1', 'bagno1', update);
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([['confirmations', 'chat-1'], ['quote']]));
  });

  it('reads the card again after a refusal too: the quote may no longer be editable', async () => {
    confirm.mockRejectedValue({
      message: 'Il preventivo è già stato inviato al team.',
    });
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useConfirmationMutation('chat-1'), {
      wrapper: wrapperWith(client),
    });
    const update = {
      measures: [{ name: 'mq', value: 6 }],
      element_choices: [],
    };

    await act(() => result.current.mutateAsync({ sectionKey: 'bagno1', update }).catch(() => undefined));

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(['confirmations', 'chat-1']);
  });
});
