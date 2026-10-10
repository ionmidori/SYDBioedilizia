/**
 * Split Markdown into top-level blocks (paragraphs, lists, headings, code
 * blocks) so a streaming message can be rendered block by block: while the
 * text grows only the LAST block changes, and memoized blocks before it are
 * not parsed again (AI SDK "memoized markdown" pattern).
 *
 * Blocks are separated by blank lines, except inside fenced code blocks
 * (``` or ~~~), whose blank lines belong to the code. No dependency: rendering
 * each block on its own gives the same output as rendering the whole text for
 * the Markdown the assistant produces (paragraphs, lists, headings, code).
 */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

export function splitMarkdownBlocks(text: string): string[] {
    const blocks: string[] = [];
    let current: string[] = [];
    let fence: string | null = null;
    let pendingBlank = false;

    const flush = () => {
        if (current.length > 0) {
            blocks.push(current.join('\n'));
            current = [];
        }
    };

    for (const line of text.split('\n')) {
        const marker = line.match(FENCE)?.[1];
        if (fence) {
            current.push(line);
            // Closing fence: same character, at least as long as the opening one.
            if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
            continue;
        }
        if (line.trim() === '') {
            pendingBlank = current.length > 0;
            continue;
        }
        if (pendingBlank) {
            pendingBlank = false;
            // An indented line after a blank line continues the previous block
            // (e.g. a list item's second paragraph): splitting it off would
            // turn a 4-space indent into a code block.
            if (/^\s/.test(line)) {
                current.push('', line);
                if (marker) fence = marker;
                continue;
            }
            flush();
        }
        if (marker) {
            fence = marker;
            current.push(line);
            continue;
        }
        current.push(line);
    }
    flush();
    return blocks;
}
