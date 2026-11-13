import type { Message, ToolInvocation } from '@/types/chat';
import { lastQuoteToolIndex, resolveToolInvocations } from '../tool-invocations';

const tool = (toolName: string, state: ToolInvocation['state'] = 'result'): ToolInvocation => ({
  toolCallId: `${toolName}-1`,
  toolName,
  state,
  args: {},
});
const assistant = (id: string, tools?: ToolInvocation[]): Message =>
  ({ id, role: 'assistant', content: '', toolInvocations: tools }) as Message;

describe('resolveToolInvocations', () => {
  it('reads the tools the live message carries', () => {
    const live = assistant('m1', [tool('generate_render')]);
    const history = assistant('m1', [tool('suggest_quote_items')]);

    expect(resolveToolInvocations(live, history).map((t) => t.toolName)).toEqual(['generate_render']);
  });

  it('reads the tools of the Firestore history when the AI SDK stripped them from the live message', () => {
    const live = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'ok' }],
    } as Message;
    const history = assistant('m1', [tool('suggest_quote_items')]);

    expect(resolveToolInvocations(live, history).map((t) => t.toolName)).toEqual(['suggest_quote_items']);
  });

  it('reads the tool-invocation parts', () => {
    const invocation = tool('analyze_room');
    const live = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'tool-invocation', toolInvocation: invocation }],
    } as Message;

    expect(resolveToolInvocations(live)).toEqual([invocation]);
  });

  it('is empty without tools', () => {
    expect(resolveToolInvocations(assistant('m1'))).toEqual([]);
  });
});

describe('lastQuoteToolIndex', () => {
  const quote = tool('suggest_quote_items');

  it('is the last message with a quote tool that finished', () => {
    const messages = [
      assistant('a', [quote]),
      { id: 'u', role: 'user', content: 'ok' } as Message,
      assistant('b', [quote]),
    ];

    expect(lastQuoteToolIndex(messages)).toBe(2);
  });

  it('skips a quote tool still running and falls back to the earlier one', () => {
    const messages = [assistant('a', [quote]), assistant('b', [tool('suggest_quote_items', 'call')])];

    expect(lastQuoteToolIndex(messages)).toBe(0);
  });

  it('ignores the other tools', () => {
    expect(lastQuoteToolIndex([assistant('a', [tool('generate_render')])])).toBe(-1);
  });

  it('ignores a quote tool on a message that is not the assistant’s', () => {
    expect(
      lastQuoteToolIndex([
        {
          id: 'u',
          role: 'user',
          content: '',
          toolInvocations: [quote],
        } as Message,
      ]),
    ).toBe(-1);
  });

  it('finds the tool in the history version of a live message', () => {
    const live = {
      id: 'a',
      role: 'assistant',
      parts: [{ type: 'text', text: 'ok' }],
    } as Message;
    const history = new Map([['a', assistant('a', [quote])]]);

    expect(lastQuoteToolIndex([live], history)).toBe(0);
  });
});
