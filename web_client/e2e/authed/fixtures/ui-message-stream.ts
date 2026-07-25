import type { Route } from '@playwright/test';

/**
 * AI SDK UI Message Stream fixture.
 *
 * Mirrors `to_ui_message_stream()` in
 * `backend_python/src/utils/stream_protocol.py` frame-for-frame. Getting this
 * wrong fails silently: `parseJsonEventStream` drops unparseable lines, so the
 * assistant bubble simply never appears (exactly the class of bug that the v5
 * -> v6 protocol migration caused in production).
 */

/** Matches TEXT_PART_ID in stream_protocol.py. */
const TEXT_PART_ID = '0';

const sse = (chunk: Record<string, unknown>) => `data: ${JSON.stringify(chunk)}\n\n`;

export interface UiMessageStreamOptions {
  text: string;
  /** Emits a transient `data-status` frame (drives the thinking indicator). */
  status?: string;
  /** How finely to split `text` into text-delta frames. */
  chunkSize?: number;
}

export function uiMessageStream({
  text,
  status,
  chunkSize = 12,
}: UiMessageStreamOptions): string {
  let out = sse({ type: 'start' });

  if (status) {
    // `transient: true` means the frame reaches onData but is NOT appended to
    // message.parts — that is how a status line shows without polluting the bubble.
    out += sse({ type: 'data-status', data: { type: 'status', message: status }, transient: true });
  }

  // text-start is mandatory: without it the v7 reducer throws
  // "Received text-delta for missing text part".
  out += sse({ type: 'text-start', id: TEXT_PART_ID });
  for (let i = 0; i < text.length; i += chunkSize) {
    out += sse({ type: 'text-delta', id: TEXT_PART_ID, delta: text.slice(i, i + chunkSize) });
  }
  out += sse({ type: 'text-end', id: TEXT_PART_ID });
  out += sse({ type: 'finish' });
  out += 'data: [DONE]\n\n';

  return out;
}

export const UI_MESSAGE_STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'x-vercel-ai-ui-message-stream': 'v1',
  'Cache-Control': 'no-cache, no-transform, no-store',
  'X-Accel-Buffering': 'no',
};

/**
 * Route handler that answers `/api/chat` with a streamed assistant reply.
 *
 * `delayMs` exists because Playwright fulfils the whole body at once, so the
 * `streaming` status can last a single frame — assert on the thinking
 * indicator only with a delay set.
 */
export function chatStreamHandler(text: string, opts: { status?: string; delayMs?: number } = {}) {
  return async (route: Route): Promise<void> => {
    if (opts.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
    await route.fulfill({
      status: 200,
      headers: UI_MESSAGE_STREAM_HEADERS,
      body: uiMessageStream({ text, status: opts.status }),
    });
  };
}
