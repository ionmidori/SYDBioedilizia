import { splitMarkdownBlocks } from '../markdown-blocks';

describe('splitMarkdownBlocks', () => {
    it('splits paragraphs, headings and lists on blank lines', () => {
        const text = '## Fasi\n\nPrima la demolizione.\n\n- impianti\n- massetto\n\nInfine la posa.';
        expect(splitMarkdownBlocks(text)).toEqual([
            '## Fasi',
            'Prima la demolizione.',
            '- impianti\n- massetto',
            'Infine la posa.',
        ]);
    });

    it('keeps blank lines inside fenced code blocks', () => {
        const text = 'Esempio:\n\n```\nriga 1\n\nriga 2\n```\n\nFine.';
        expect(splitMarkdownBlocks(text)).toEqual(['Esempio:', '```\nriga 1\n\nriga 2\n```', 'Fine.']);
    });

    it('closes a fence only with the same marker', () => {
        const text = '~~~\n```\n\nancora codice\n~~~\n\ndopo';
        expect(splitMarkdownBlocks(text)).toEqual(['~~~\n```\n\nancora codice\n~~~', 'dopo']);
    });

    it('keeps an indented continuation with its list item (no accidental code block)', () => {
        const text = '1. Demolizione\n\n    rimozione delle piastrelle\n2. Impianti';
        expect(splitMarkdownBlocks(text)).toEqual([
            '1. Demolizione\n\n    rimozione delle piastrelle\n2. Impianti',
        ]);
    });

    it('handles text still being streamed (unterminated block or fence)', () => {
        expect(splitMarkdownBlocks('Primo paragrafo.\n\nSecondo in corso')).toEqual([
            'Primo paragrafo.',
            'Secondo in corso',
        ]);
        expect(splitMarkdownBlocks('Codice:\n\n```js\nconst a = 1;\n\n')).toEqual([
            'Codice:',
            '```js\nconst a = 1;\n\n',
        ]);
    });

    it('only the last block changes while text grows', () => {
        const a = splitMarkdownBlocks('Uno.\n\nDue.\n\nTr');
        const b = splitMarkdownBlocks('Uno.\n\nDue.\n\nTre, completo.');
        expect(b.slice(0, -1)).toEqual(a.slice(0, -1));
    });

    it('returns nothing for empty text', () => {
        expect(splitMarkdownBlocks('')).toEqual([]);
        expect(splitMarkdownBlocks('\n\n')).toEqual([]);
    });
});
