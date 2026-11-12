import { blocksToPlainText } from '@/lib/company-info/blocks';
import { COMPANY_ICONS } from '@/lib/company-info/icons';
import { iconNameSchema, type Block } from '@/types/company-info';

describe('blocksToPlainText', () => {
    it('flattens all block types and strips bold markers', () => {
        const blocks: Block[] = [
            { type: 'lead', text: 'Costo **medio** al mq.' },
            { type: 'p', text: 'Fattori:' },
            { type: 'ul', items: ['**A:** uno.', '**B:** due.'] },
            { type: 'definitions', items: [{ term: 'CILA:', description: 'serve per X.' }] },
        ];
        const text = blocksToPlainText(blocks);
        expect(text).toBe('Costo medio al mq. Fattori: A: uno. B: due. CILA: serve per X.');
        expect(text).not.toContain('*');
    });

    it('is empty for no blocks', () => {
        expect(blocksToPlainText([])).toBe('');
    });
});

describe('COMPANY_ICONS', () => {
    it.each(iconNameSchema.options)('has an icon for "%s"', (name) => {
        expect(COMPANY_ICONS[name]).toBeDefined();
    });
});
