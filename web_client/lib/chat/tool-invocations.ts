import type { Message, ToolInvocation } from '@/types/chat';

/** Backend tool that prepares the quote draft (backend_python/src/adk/tools.py): the card answers it. */
export const QUOTE_TOOL = 'suggest_quote_items';

/** Tool calls of one message, from both formats (`toolInvocations` and `tool-invocation` parts). */
function invocationsOf(message: Message): ToolInvocation[] {
  if (message.toolInvocations && message.toolInvocations.length > 0) return message.toolInvocations;
  if (message.parts && Array.isArray(message.parts)) {
    return (message.parts as { type: string; toolInvocation?: ToolInvocation }[])
      .filter((part) => part.type === 'tool-invocation' && part.toolInvocation)
      .map((part) => part.toolInvocation as ToolInvocation);
  }
  return [];
}

/**
 * The tool calls of a message. The AI SDK v7 keeps assistant message state text-only (it strips
 * `toolInvocations`): when the live message carries none, the Firestore-history version of the
 * same message has them, with each result already linked by useChatHistory.
 */
export function resolveToolInvocations(message: Message, historyMessage?: Message): ToolInvocation[] {
  const live = invocationsOf(message);
  if (live.length > 0) return live;
  return historyMessage ? invocationsOf(historyMessage) : [];
}

/** Index of the last assistant message whose quote tool finished, `-1` if none: the card goes under it. */
export function lastQuoteToolIndex(messages: readonly Message[], historyById?: ReadonlyMap<string, Message>): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const tools = resolveToolInvocations(message, message.id ? historyById?.get(message.id) : undefined);
    if (tools.some((tool) => tool.toolName === QUOTE_TOOL && tool.state === 'result')) return index;
  }
  return -1;
}
