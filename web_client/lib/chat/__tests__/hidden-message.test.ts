import { CARD_CONFIRMED_EVENT, HIDDEN_METADATA, isHiddenMessage, withoutHidden } from '../hidden-message';

describe('hidden messages (the signals the client sends by itself)', () => {
  it('knows a message sent as a signal', () => {
    expect(isHiddenMessage({ id: 'a', role: 'user', metadata: HIDDEN_METADATA })).toBe(true);
  });

  it.each([
    ['without metadata', { id: 'a', role: 'user' }],
    ['with other metadata', { id: 'a', role: 'user', metadata: { room: 'bagno' } }],
    ['with hidden set to something else', { id: 'a', role: 'user', metadata: { hidden: 'yes' } }],
    ['with null metadata', { id: 'a', role: 'user', metadata: null }],
  ])('does not hide a message %s', (_label, message) => {
    expect(isHiddenMessage(message)).toBe(false);
  });

  it('keeps the others and the order', () => {
    const shown = { id: '1', role: 'user' };
    const hidden = { id: '2', role: 'user', metadata: HIDDEN_METADATA };
    const reply = { id: '3', role: 'assistant' };
    expect(withoutHidden([shown, hidden, reply])).toEqual([shown, reply]);
  });

  it('returns the same array when nothing is hidden (no re-render for nothing)', () => {
    const messages = [{ id: '1', role: 'user' }];
    expect(withoutHidden(messages)).toBe(messages);
  });

  it('names the event the backend knows (ChatRequest.event)', () => {
    expect(CARD_CONFIRMED_EVENT).toBe('card_confirmed');
  });
});
