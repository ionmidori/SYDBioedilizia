import { BLOCK_TYPES, convertBlock, emptyBlock, parseLines } from '@/lib/admin/company-blocks';
import type { Block } from '@/types/company-info';

describe('parseLines', () => {
    it('keeps one trimmed item per non-empty line', () => {
        expect(parseLines('a\n\n  b  \n')).toEqual(['a', 'b']);
        expect(parseLines('')).toEqual([]);
        expect(parseLines('a\r\nb')).toEqual(['a', 'b']);
    });
});

describe('emptyBlock', () => {
    it('is empty and valid in shape for each type', () => {
        expect(emptyBlock('p')).toEqual({ type: 'p', text: '' });
        expect(emptyBlock('ul')).toEqual({ type: 'ul', items: [''] });
        expect(emptyBlock('definitions')).toEqual({ type: 'definitions', items: [{ term: '', description: '' }] });
    });
});

describe('convertBlock', () => {
    it('keeps the text between text types', () => {
        expect(convertBlock({ type: 'p', text: 'Ciao' }, 'note')).toEqual({ type: 'note', text: 'Ciao' });
    });

    it('splits a text into one item per line, and joins the items back', () => {
        expect(convertBlock({ type: 'p', text: 'uno\ndue\n\ntre' }, 'ul')).toEqual({ type: 'ul', items: ['uno', 'due', 'tre'] });
        expect(convertBlock({ type: 'ol', items: ['uno', 'due'] }, 'p')).toEqual({ type: 'p', text: 'uno\ndue' });
    });

    it('turns a list into definitions with the item as the term, and back to lines', () => {
        const defs = convertBlock({ type: 'ul', items: ['Garanzia'] }, 'definitions');
        expect(defs).toEqual({ type: 'definitions', items: [{ term: 'Garanzia', description: '' }] });
        const back = convertBlock({ type: 'definitions', items: [{ term: 'A', description: 'b' }, { term: 'C', description: '' }] }, 'ul');
        expect(back).toEqual({ type: 'ul', items: ['A: b', 'C'] });
    });

    it('returns the same block for the same type', () => {
        const block: Block = { type: 'ol', items: ['x'] };
        expect(convertBlock(block, 'ol')).toBe(block);
    });

    it('never produces a list or definitions without an entry to edit', () => {
        expect(convertBlock({ type: 'p', text: '' }, 'ul')).toEqual({ type: 'ul', items: [''] });
        expect(convertBlock({ type: 'p', text: '' }, 'definitions')).toEqual({
            type: 'definitions',
            items: [{ term: '', description: '' }],
        });
    });
});

describe('BLOCK_TYPES', () => {
    it('lists the seven block types with an Italian name', () => {
        expect(BLOCK_TYPES.map((t) => t.type)).toEqual(['lead', 'p', 'note', 'callout', 'ul', 'ol', 'definitions']);
        expect(BLOCK_TYPES.every((t) => t.label.length > 0)).toBe(true);
    });
});
