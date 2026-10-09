/**
 * Client-side chat latency marks (User Timing API).
 *
 * One turn = send -> first visible assistant text -> stream finished.
 * Measures are exposed as `performance` entries, readable in the DevTools
 * Performance panel or with `performance.getEntriesByType('measure')`:
 *
 *   syd-chat:ttft   send -> first assistant text (time to first token as seen by the user)
 *   syd-chat:total  send -> stream finished
 *
 * Nothing is sent to third parties: the entries stay in the browser.
 */
import { logger } from '@/lib/logger';

const SEND = 'syd-chat:send';
const FIRST_TEXT = 'syd-chat:first-text';
const FINISH = 'syd-chat:finish';

let turnOpen = false;
let firstTextSeen = false;

function supported(): boolean {
    return (
        typeof performance !== 'undefined' &&
        typeof performance.mark === 'function' &&
        typeof performance.measure === 'function' &&
        typeof performance.clearMarks === 'function'
    );
}

function measure(name: string, start: string, end: string): number | undefined {
    try {
        return performance.measure(name, start, end).duration;
    } catch {
        // Start mark missing (e.g. cleared by the browser): nothing to measure.
        return undefined;
    }
}

export function markChatSend(): void {
    if (!supported()) return;
    performance.clearMarks(SEND);
    performance.clearMarks(FIRST_TEXT);
    performance.clearMarks(FINISH);
    performance.mark(SEND);
    turnOpen = true;
    firstTextSeen = false;
}

export function markChatFirstText(): void {
    if (!supported() || !turnOpen || firstTextSeen) return;
    firstTextSeen = true;
    performance.mark(FIRST_TEXT);
    const ttft = measure('syd-chat:ttft', SEND, FIRST_TEXT);
    logger.debug('[ChatLatency] TTFT ms:', ttft);
}

export function markChatFinish(): void {
    if (!supported() || !turnOpen) return;
    turnOpen = false;
    performance.mark(FINISH);
    const total = measure('syd-chat:total', SEND, FINISH);
    logger.debug('[ChatLatency] total ms:', total);
}
