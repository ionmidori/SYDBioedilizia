import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { BlocksEditor } from '../BlocksEditor';
import type { CompanyIssue } from '@/lib/admin/company-info-logic';
import type { Block } from '@/types/company-info';

/** Controlled like the editor tabs are: the value lives in the parent. */
function Harness({
    initial,
    onValue,
    minBlocks,
    issues,
}: {
    initial: Block[];
    onValue?: (blocks: Block[]) => void;
    minBlocks?: number;
    issues?: CompanyIssue[];
}) {
    const [value, setValue] = useState(initial);
    return (
        <BlocksEditor
            id="x"
            label="Risposta"
            value={value}
            minBlocks={minBlocks}
            issues={issues}
            onChange={(next) => {
                setValue(next);
                onValue?.(next);
            }}
        />
    );
}

const last = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0];

describe('BlocksEditor', () => {
    it('adds a paragraph', () => {
        const onValue = jest.fn();
        render(<Harness initial={[]} onValue={onValue} />);
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi blocco' }));
        expect(last(onValue)).toEqual([{ type: 'p', text: '' }]);
        expect(screen.getByLabelText('Testo del blocco 1')).toBeInTheDocument();
    });

    it('edits the text of a block', () => {
        const onValue = jest.fn();
        render(<Harness initial={[{ type: 'p', text: 'Ciao' }]} onValue={onValue} />);
        fireEvent.change(screen.getByLabelText('Testo del blocco 1'), { target: { value: 'Ciao a **tutti**' } });
        expect(last(onValue)).toEqual([{ type: 'p', text: 'Ciao a **tutti**' }]);
    });

    it('keeps one item per non-empty line of a list, and lets the admin type a new line', () => {
        const onValue = jest.fn();
        render(<Harness initial={[{ type: 'ul', items: ['uno'] }]} onValue={onValue} />);
        const field = screen.getByLabelText('Voci del blocco 1 (una per riga)');
        fireEvent.change(field, { target: { value: 'uno\n\ndue' } });
        expect(last(onValue)).toEqual([{ type: 'ul', items: ['uno', 'due'] }]);
        fireEvent.change(field, { target: { value: 'uno\ndue\n' } });
        expect(field).toHaveValue('uno\ndue\n');
        expect(last(onValue)).toEqual([{ type: 'ul', items: ['uno', 'due'] }]);
    });

    it('turns a paragraph into a list by lines, and back', () => {
        const onValue = jest.fn();
        render(<Harness initial={[{ type: 'p', text: 'uno\ndue' }]} onValue={onValue} />);
        fireEvent.change(screen.getByLabelText('Tipo del blocco 1'), { target: { value: 'ul' } });
        expect(last(onValue)).toEqual([{ type: 'ul', items: ['uno', 'due'] }]);
        expect(screen.getByLabelText('Voci del blocco 1 (una per riga)')).toHaveValue('uno\ndue');
        fireEvent.change(screen.getByLabelText('Tipo del blocco 1'), { target: { value: 'p' } });
        expect(last(onValue)).toEqual([{ type: 'p', text: 'uno\ndue' }]);
    });

    it('edits and adds definitions', () => {
        const onValue = jest.fn();
        render(<Harness initial={[{ type: 'definitions', items: [{ term: 'A', description: 'a' }] }]} onValue={onValue} />);
        fireEvent.change(screen.getByLabelText('Termine 1 del blocco 1'), { target: { value: 'Garanzia' } });
        fireEvent.change(screen.getByLabelText('Descrizione 1 del blocco 1'), { target: { value: 'Dieci anni' } });
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi termine al blocco 1' }));
        expect(last(onValue)).toEqual([
            {
                type: 'definitions',
                items: [
                    { term: 'Garanzia', description: 'Dieci anni' },
                    { term: '', description: '' },
                ],
            },
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Elimina il termine 2 del blocco 1' }));
        expect(last(onValue)[0].items).toHaveLength(1);
    });

    it('moves and removes blocks', () => {
        const onValue = jest.fn();
        render(
            <Harness
                initial={[
                    { type: 'p', text: 'uno' },
                    { type: 'p', text: 'due' },
                ]}
                onValue={onValue}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Sposta giù il blocco 1' }));
        expect(last(onValue).map((b: { text: string }) => b.text)).toEqual(['due', 'uno']);
        fireEvent.click(screen.getByRole('button', { name: 'Elimina il blocco 1' }));
        expect(last(onValue)).toEqual([{ type: 'p', text: 'uno' }]);
        expect(screen.getByRole('button', { name: 'Sposta su il blocco 1' })).toBeDisabled();
    });

    it('shows the right entries after two lists swap places (no stale text kept)', () => {
        const onValue = jest.fn();
        render(
            <Harness
                initial={[
                    { type: 'ul', items: ['A'] },
                    { type: 'ul', items: ['B'] },
                ]}
                onValue={onValue}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Sposta giù il blocco 1' }));
        expect(screen.getByLabelText('Voci del blocco 1 (una per riga)')).toHaveValue('B');
        fireEvent.change(screen.getByLabelText('Voci del blocco 2 (una per riga)'), { target: { value: 'A2' } });
        expect(last(onValue)).toEqual([
            { type: 'ul', items: ['B'] },
            { type: 'ul', items: ['A2'] },
        ]);
    });

    // Final review C1: a list entry the typed text cannot reproduce (trailing space, a line break) made the
    // field reset its text on every render: "Too many re-renders", and every unsaved edit was lost.
    it('converts definitions whose term ends in a space to a list without crashing', () => {
        render(<Harness initial={[{ type: 'definitions', items: [{ term: 'Bonus ', description: '' }] }]} />);
        fireEvent.change(screen.getByLabelText('Tipo del blocco 1'), { target: { value: 'ul' } });
        expect(screen.getByLabelText('Voci del blocco 1 (una per riga)')).toHaveValue('Bonus');
    });

    it('opens a list whose entry holds a line break without crashing', () => {
        render(<Harness initial={[{ type: 'ul', items: ['a\nb'] }]} />);
        expect(screen.getByLabelText('Voci del blocco 1 (una per riga)')).toHaveValue('a\nb');
    });

    it('does not remove the last block when a minimum is required', () => {
        render(<Harness initial={[{ type: 'p', text: 'uno' }]} minBlocks={1} />);
        expect(screen.getByRole('button', { name: 'Elimina il blocco 1' })).toBeDisabled();
    });

    it('previews the blocks as the site shows them, with bold text', () => {
        render(<Harness initial={[{ type: 'p', text: 'Ciao **tutti**' }]} />);
        expect(screen.queryByTestId('x-preview')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
        const preview = screen.getByTestId('x-preview');
        expect(preview.querySelector('strong')).toHaveTextContent('tutti');
    });

    it('shows the problem of a field under it, with the id the editor focuses', () => {
        const issues: CompanyIssue[] = [{ tab: 'faq', path: ['x', 0, 'text'], fieldId: 'x-0-text', message: 'Campo obbligatorio' }];
        render(<Harness initial={[{ type: 'p', text: '' }]} issues={issues} />);
        const field = screen.getByLabelText('Testo del blocco 1');
        expect(field).toHaveAttribute('id', 'x-0-text');
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('Campo obbligatorio')).toBeInTheDocument();
    });

    it('stops adding at the 60 blocks the backend accepts', () => {
        render(<Harness initial={Array.from({ length: 60 }, () => ({ type: 'p' as const, text: 'x' }))} />);
        expect(screen.getByRole('button', { name: 'Aggiungi blocco' })).toBeDisabled();
    });
});
