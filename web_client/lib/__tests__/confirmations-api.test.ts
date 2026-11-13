import { fetchValidated } from '@/lib/api-client';
import { confirmationResultSchema, confirmationStateSchema } from '@/types/confirmation';
import { confirmationsApi } from '../confirmations-api';

jest.mock('@/lib/api-client', () => ({ fetchValidated: jest.fn() }));

const mockFetchValidated = fetchValidated as jest.Mock;

beforeEach(() => mockFetchValidated.mockReset());

describe('confirmationsApi.getState', () => {
  it('reads the state of the card of the project, validated', async () => {
    const state = { sections: [], editable: true, precision: null };
    mockFetchValidated.mockResolvedValue(state);

    await expect(confirmationsApi.getState('chat 1')).resolves.toBe(state);

    const [url, schema] = mockFetchValidated.mock.calls[0];
    expect(url).toMatch(/\/projects\/chat%201\/confirmations$/);
    expect(schema).toBe(confirmationStateSchema);
  });
});

describe('confirmationsApi.confirm', () => {
  const update = { measures: [{ name: 'mq', value: 6 }], element_choices: [] };

  it('puts the confirmed values of one section', async () => {
    mockFetchValidated.mockResolvedValue({});

    await confirmationsApi.confirm('chat-1', 'bagno1', update);

    const [url, schema, options] = mockFetchValidated.mock.calls[0];
    expect(url).toMatch(/\/projects\/chat-1\/confirmations\/bagno1$/);
    expect(schema).toBe(confirmationResultSchema);
    expect(options.method).toBe('PUT');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual(update);
  });

  it('sends nothing the backend would refuse (a value over 10 000)', async () => {
    const tooBig = {
      measures: [{ name: 'mq', value: 10_001 }],
      element_choices: [],
    };

    await expect(confirmationsApi.confirm('chat-1', 'bagno1', tooBig)).rejects.toThrow();

    expect(mockFetchValidated).not.toHaveBeenCalled();
  });
});
