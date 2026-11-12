/**
 * Text blocks of the company info (FAQ answers, About, sections).
 *
 * Blocks are structured data, NOT HTML: they render through plain React elements
 * (components/faq/FAQAnswer.tsx) and never touch dangerouslySetInnerHTML. Inline
 * emphasis is `**bold**`, turned into <strong> elements by RichInline.
 */
import type { Block } from '@/types/company-info';

const strip = (text: string): string => text.replace(/\*\*/g, '');

/**
 * Flatten blocks to plain text (no markers, no markup).
 * Used for the FAQPage JSON-LD `acceptedAnswer.text`.
 */
export function blocksToPlainText(blocks: Block[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'lead':
            case 'p':
            case 'note':
            case 'callout':
                parts.push(strip(block.text));
                break;
            case 'ul':
            case 'ol':
                parts.push(block.items.map(strip).join(' '));
                break;
            case 'definitions':
                parts.push(block.items.map((d) => `${strip(d.term)} ${strip(d.description)}`).join(' '));
                break;
        }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
