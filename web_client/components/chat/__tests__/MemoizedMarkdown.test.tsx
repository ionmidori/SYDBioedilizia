import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoizedMarkdown, safeUrlTransform } from '../MemoizedMarkdown';

// ESM-only module not transformed by Jest: a probe that counts renders per block.
const renders: string[] = [];
const pluginsSeen: unknown[] = [];
const transformsSeen: unknown[] = [];
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children, remarkPlugins, urlTransform }: { children?: string; remarkPlugins?: unknown; urlTransform?: unknown }) => {
        renders.push(String(children));
        pluginsSeen.push(remarkPlugins);
        transformsSeen.push(urlTransform);
        return <p data-testid="md-block">{children}</p>;
    },
}));

beforeEach(() => {
    renders.length = 0;
    pluginsSeen.length = 0;
    transformsSeen.length = 0;
});

describe('MemoizedMarkdown', () => {
    it('renders one Markdown element per block', () => {
        render(<MemoizedMarkdown>{'Uno.\n\nDue.\n\nTre.'}</MemoizedMarkdown>);
        expect(screen.getAllByTestId('md-block').map(e => e.textContent)).toEqual(['Uno.', 'Due.', 'Tre.']);
    });

    it('re-renders only the block that is still growing', () => {
        const { rerender } = render(<MemoizedMarkdown>{'Uno.\n\nDue.\n\nTr'}</MemoizedMarkdown>);
        renders.length = 0;
        rerender(<MemoizedMarkdown>{'Uno.\n\nDue.\n\nTre, completo.'}</MemoizedMarkdown>);
        expect(renders).toEqual(['Tre, completo.']);
    });

    it('hands the remark plugins to every block', () => {
        const plugins = [() => () => undefined];
        render(<MemoizedMarkdown remarkPlugins={plugins}>{'Uno.\n\nDue.'}</MemoizedMarkdown>);
        expect(pluginsSeen).toEqual([plugins, plugins]);
    });

    it('hands a custom url transform to every block, else the safe one', () => {
        const allowTel = (url: string) => url;
        render(<MemoizedMarkdown urlTransform={allowTel}>{'Uno.\n\nDue.'}</MemoizedMarkdown>);
        expect(transformsSeen).toEqual([allowTel, allowTel]);

        transformsSeen.length = 0;
        render(<MemoizedMarkdown>{'Tre.'}</MemoizedMarkdown>);
        expect(transformsSeen).toEqual([safeUrlTransform]);
    });

    it('keeps only safe link protocols', () => {
        expect(safeUrlTransform('https://example.com')).toBe('https://example.com');
        expect(safeUrlTransform('/progetti')).toBe('/progetti');
        expect(safeUrlTransform('mailto:info@example.com')).toBe('mailto:info@example.com');
        expect(safeUrlTransform('https://wa.me/393755463599')).toBe('https://wa.me/393755463599');
        // Final review: a `tel:` the MODEL writes ([Assistenza](tel:+39899…), e.g. after a prompt
        // injection) must not become a link. Only the company numbers are allowed, by MessageItem.
        expect(safeUrlTransform('tel:+39899123456')).toBe('');
        expect(safeUrlTransform('tel:javascript:alert(1)')).toBe('');
        expect(safeUrlTransform('javascript:alert(1)')).toBe('');
        expect(safeUrlTransform('data:text/html,x')).toBe('');
    });
});
