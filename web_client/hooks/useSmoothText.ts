import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Reveals streamed assistant text progressively instead of in blocks.
 *
 * The model produces ~1,000 chars/s and the backend's output guard releases
 * text in chunks (it always holds back the last 120 chars, so a short reply
 * arrives at once when generation ends). This hook only paces what the browser
 * has ALREADY received: it never delays content — any backlog is drained within
 * ~DRAIN_MS, so the reply finishes at most that much after its last byte.
 *
 * - `animate` is true only for replies streamed live in this tab; history and
 *   reduced-motion users get the full text immediately.
 * - If the new text does not extend what is shown (a guardrail retraction via
 *   `data-redact`), it is shown at once.
 */
const DRAIN_MS = 350; // a backlog of any size is shown within this time
const MIN_CHARS_PER_MS = 0.06; // floor speed (~60 chars/s) for tiny backlogs
const MIN_COMMIT_MS = 33; // at most ~30 React updates per second
const WORD_LOOKAHEAD = 16; // extend a step to the end of the current word

/** Next reveal point: `from + step`, moved forward to the end of the word. */
function nextCut(text: string, from: number, step: number): number {
    const cut = Math.min(text.length, from + step);
    if (cut >= text.length) return text.length;
    const space = text.slice(cut, cut + WORD_LOOKAHEAD).search(/\s/);
    return space === -1 ? cut : cut + space;
}

export function useSmoothText(target: string, animate: boolean): string {
    const reduceMotion = useReducedMotion();
    const enabled = animate && !reduceMotion;
    const initial = enabled ? '' : target;
    const [shown, setShown] = useState(initial);
    const shownRef = useRef(initial); // read/written only inside the effect

    useEffect(() => {
        if (!enabled) {
            shownRef.current = target;
            return;
        }
        if (!target.startsWith(shownRef.current)) {
            // Retraction or a different message: no animation from a wrong prefix.
            shownRef.current = target;
            setShown(target);
            return;
        }
        // Linear speed fixed when new text arrives: the whole backlog is shown
        // within DRAIN_MS (a per-frame fraction would decay and never finish).
        const charsPerMs = Math.max(MIN_CHARS_PER_MS, (target.length - shownRef.current.length) / DRAIN_MS);
        let frame = 0;
        let last = performance.now();
        const tick = (now: number) => {
            if (shownRef.current.length >= target.length) return;
            const elapsed = now - last;
            // Skip frames until MIN_COMMIT_MS has passed: each update re-renders
            // the message, so fewer, word-aligned steps cost less and read better.
            if (elapsed < MIN_COMMIT_MS) {
                frame = requestAnimationFrame(tick);
                return;
            }
            last = now;
            const step = Math.max(1, Math.ceil(elapsed * charsPerMs));
            shownRef.current = target.slice(0, nextCut(target, shownRef.current.length, step));
            setShown(shownRef.current);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, enabled]);

    return enabled ? shown : target;
}
