import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

/**
 * Dialogs and sheets animate in and out with the tw-animate-css utilities, keyed on the
 * Radix data-state attribute. Lint (better-tailwindcss/no-unknown-classes) proves the
 * classes exist; these tests prove the components ask for them and the plugin is loaded.
 */
const ENTER_EXIT = ['data-[state=open]:animate-in', 'data-[state=closed]:animate-out'];
const SIDES = ['top', 'bottom', 'left', 'right'] as const;

function overlay(): Element {
    const el = document.body.querySelector('.bg-scrim');
    if (!el) throw new Error('overlay not rendered');
    return el;
}

it('globals.css loads tw-animate-css', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf8');
    expect(css).toMatch(/@import\s+["']tw-animate-css["'];/);
});

describe('Dialog', () => {
    beforeEach(() => {
        render(
            <Dialog open>
                <DialogContent>
                    <DialogTitle>Titolo</DialogTitle>
                    <DialogDescription>Descrizione</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
    });

    it('content fades and zooms in and out', () => {
        expect(screen.getByRole('dialog')).toHaveClass(
            ...ENTER_EXIT,
            'data-[state=open]:fade-in-0',
            'data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95',
            'data-[state=closed]:zoom-out-95',
        );
    });

    it('overlay fades in and out', () => {
        expect(overlay()).toHaveClass(...ENTER_EXIT, 'data-[state=open]:fade-in-0', 'data-[state=closed]:fade-out-0');
    });
});

describe('Sheet', () => {
    it.each(SIDES)('slides in and out from the %s edge', (side) => {
        render(
            <Sheet open>
                <SheetContent side={side}>
                    <SheetTitle>Titolo</SheetTitle>
                    <SheetDescription>Descrizione</SheetDescription>
                </SheetContent>
            </Sheet>,
        );
        expect(screen.getByRole('dialog')).toHaveClass(
            ...ENTER_EXIT,
            `data-[state=open]:slide-in-from-${side}`,
            `data-[state=closed]:slide-out-to-${side}`,
        );
        expect(overlay()).toHaveClass(...ENTER_EXIT);
    });
});
