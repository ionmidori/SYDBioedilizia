/**
 * Hidden messages: a signal the web client sends by itself (e.g. after the last confirmation on the
 * quote card), not something the client wrote. It goes to the AI SDK as a message carrying
 * `metadata.hidden`, and with `body.event` for the backend (`ChatRequest.event`): the backend never
 * saves it and the agent reads its own fixed words. The chat never draws it.
 */

/** The only event the backend knows (`CardEvent` in backend_python/src/services/card_event.py). */
export const CARD_CONFIRMED_EVENT = 'card_confirmed';
export type ChatEvent = typeof CARD_CONFIRMED_EVENT;

/** Metadata of a message sent as a signal (AI SDK v7: `sendMessage({ text, metadata })`). */
export const HIDDEN_METADATA = { hidden: true } as const;

/**
 * The words that travel with the signal: the AI SDK needs some text, the backend ignores it. Never
 * shown, and not a request the agent could read if it did (no yes, no change).
 */
export const SIGNAL_TEXT = 'Scheda confermata.';

export function isHiddenMessage(message: { metadata?: unknown }): boolean {
  const { metadata } = message;
  return typeof metadata === 'object' && metadata !== null && (metadata as { hidden?: unknown }).hidden === true;
}

/** The messages the client sees; the same array when none is hidden, so memoized children keep their props. */
export function withoutHidden<T extends { metadata?: unknown }>(messages: readonly T[]): readonly T[] {
  return messages.some(isHiddenMessage) ? messages.filter((m) => !isHiddenMessage(m)) : messages;
}
