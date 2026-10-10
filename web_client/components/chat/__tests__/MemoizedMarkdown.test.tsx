import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoizedMarkdown, safeUrlTransform } from '../MemoizedMarkdown';

// ESM-only module not transformed by Jest: a probe that counts renders per block.
const renders: string[] = [];
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children?: string }) => {
        renders.push(String(children));
        return <p data-testid="md-block">{children}</p>;
    },
}));

beforeEach(() => {
    renders.length = 0;
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

    it('keeps only safe link protocols', () => {
        expect(safeUrlTransform('https://example.com')).toBe('https://example.com');
        expect(safeUrlTransform('/progetti')).toBe('/progetti');
        expect(safeUrlTransform('mailto:info@example.com')).toBe('mailto:info@example.com');
        expect(safeUrlTransform('javascript:alert(1)')).toBe('');
        expect(safeUrlTransform('data:text/html,x')).toBe('');
    });
});
