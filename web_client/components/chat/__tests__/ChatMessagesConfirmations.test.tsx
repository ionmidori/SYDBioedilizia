import { render, screen } from '@testing-library/react';
import { MutableRefObject } from 'react';
import { ChatMessages } from '../ChatMessages';
import type { Message, ToolInvocation } from '@/types/chat';

// The card is MessageItem's job (MessageItem.test.tsx): here only what ChatMessages tells it.
jest.mock('@/components/chat/MessageItem', () => ({
  MessageItem: ({ message, showConfirmations }: { message: Message; showConfirmations?: boolean }) => (
    <div data-testid={`message-${message.id}`} data-confirmations={String(Boolean(showConfirmations))} />
  ),
}));

const quoteTool = (state: ToolInvocation['state'] = 'result'): ToolInvocation => ({
  toolCallId: 'c1',
  toolName: 'suggest_quote_items',
  state,
  args: {},
});
const assistant = (id: string, toolInvocations?: ToolInvocation[]) =>
  ({ id, role: 'assistant', content: 'ok', toolInvocations }) as Message;
const user = (id: string) => ({ id, role: 'user', content: 'ciao' }) as Message;

const refs = {
  messagesContainerRef: {
    current: null,
  } as MutableRefObject<HTMLDivElement | null>,
  messagesEndRef: { current: null } as MutableRefObject<HTMLDivElement | null>,
};

const shown = (id: string) => screen.getByTestId(`message-${id}`).dataset.confirmations;

describe('ChatMessages — where the confirmation card goes', () => {
  it('only under the last reply that prepared the quote', () => {
    const messages = [assistant('a', [quoteTool()]), user('u'), assistant('b', [quoteTool()]), assistant('c')];
    render(<ChatMessages messages={messages} isLoading={false} sessionId="s1" {...refs} />);

    expect(shown('a')).toBe('false');
    expect(shown('b')).toBe('true');
    expect(shown('c')).toBe('false');
  });

  it('finds the tool in the history version of a live message (the AI SDK strips it)', () => {
    const live = {
      id: 'a',
      role: 'assistant',
      parts: [{ type: 'text', text: 'ok' }],
    } as Message;
    render(
      <ChatMessages
        messages={[live]}
        historyMessages={[assistant('a', [quoteTool()])]}
        isLoading={false}
        sessionId="s1"
        {...refs}
      />,
    );

    expect(shown('a')).toBe('true');
  });

  it('nowhere while the quote tool is still running', () => {
    render(<ChatMessages messages={[assistant('a', [quoteTool('call')])]} isLoading sessionId="s1" {...refs} />);

    expect(shown('a')).toBe('false');
  });
});
