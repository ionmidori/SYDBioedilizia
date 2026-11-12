/**
 * Text blocks of the company info (`Block`): what the block editor offers, and how a block of one
 * type becomes another one without losing what was written. Pure functions, no I/O.
 */
import type { Block } from '@/types/company-info';

export type BlockType = Block['type'];

export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
    { type: 'lead', label: 'Introduzione' },
    { type: 'p', label: 'Paragrafo' },
    { type: 'note', label: 'Nota' },
    { type: 'callout', label: 'Riquadro' },
    { type: 'ul', label: 'Elenco puntato' },
    { type: 'ol', label: 'Elenco numerato' },
    { type: 'definitions', label: 'Definizioni' },
];

/** The most blocks the backend accepts in one text. */
export const MAX_BLOCKS = 60;

/** One trimmed item per non-empty line. */
export function parseLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

export function emptyBlock(type: BlockType): Block {
    switch (type) {
        case 'ul':
        case 'ol':
            return { type, items: [''] };
        case 'definitions':
            return { type, items: [{ term: '', description: '' }] };
        default:
            return { type, text: '' };
    }
}

/** What a block says, one line per entry: the common ground between text, lists and definitions. */
function linesOf(block: Block): string[] {
    switch (block.type) {
        case 'ul':
        case 'ol':
            return block.items;
        case 'definitions':
            return block.items.map((def) => (def.description ? `${def.term}: ${def.description}` : def.term).trim());
        default:
            return parseLines(block.text);
    }
}

/** The same content as another type of block; the very same block when the type does not change. */
export function convertBlock(block: Block, type: BlockType): Block {
    if (block.type === type) return block;
    switch (type) {
        case 'ul':
        case 'ol': {
            const items = block.type === 'ul' || block.type === 'ol' ? block.items : linesOf(block);
            return { type, items: items.length > 0 ? items : [''] };
        }
        case 'definitions': {
            const items = block.type === 'definitions' ? block.items : linesOf(block).map((term) => ({ term, description: '' }));
            return { type, items: items.length > 0 ? items : [{ term: '', description: '' }] };
        }
        default:
            return { type, text: 'text' in block ? block.text : linesOf(block).join('\n') };
    }
}
