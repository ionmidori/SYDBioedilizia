import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

/**
 * Dialogs and sheets animate in and out with the tw-animate-css utilities, keyed on the
 * Radix data-state attribute. Lint (better-tailwindcss/no-unknown-classes) and the build
 * prove the classes exist; these tests prove the components ask for them, and that the
 * backdrop fades exactly as long as the panel moves (otherwise one outlives the other).
 */
const ENTER_EXIT = ['data-[state=open]:animate-in', 'data-[state=closed]:animate-out'];
const SIDES = ['top', 'bottom', 'left', 'right'] as const;

function overlay(): Element | null {
    return document.body.querySelector('.bg-scrim');
}

/** The duration classes of an element, per state (a plain duration-* applies to both). */
function durations(el: Element): { open?: string; closed?: string } {
    const cls = [...el.classList];
    const plain = cls.find((c) => /^duration-\d+$/.test(c));
    const of = (state: string) => cls.find((c) => c.startsWith(`data-[state=${state}]:duration-`))?.split(':')[1] ?? plain;
    return { open: of('open'), closed: of('closed') };
}

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

    it('overlay fades in and out as long as the content animates', () => {
        const o = overlay();
        expect(o).toHaveClass(...ENTER_EXIT, 'data-[state=open]:fade-in-0', 'data-[state=closed]:fade-out-0');
        expect(durations(o!)).toEqual(durations(screen.getByRole('dialog')));
        expect(durations(o!).open).toBeDefined();
    });
});

describe('Sheet', () => {
    it.each(SIDES)('slides in and out from the %s edge, with the overlay in step', (side) => {
        render(
            <Sheet open>
                <SheetContent side={side}>
                    <SheetTitle>Titolo</SheetTitle>
                    <SheetDescription>Descrizione</SheetDescription>
                </SheetContent>
            </Sheet>,
        );
        const content = screen.getByRole('dialog');
        expect(content).toHaveClass(
            ...ENTER_EXIT,
            `data-[state=open]:slide-in-from-${side}`,
            `data-[state=closed]:slide-out-to-${side}`,
        );
        const o = overlay();
        expect(o).toHaveClass(...ENTER_EXIT);
        expect(durations(o!)).toEqual(durations(content));
    });

    it('still animates without an overlay (hideOverlay, as the mobile menu uses it)', () => {
        render(
            <Sheet open>
                <SheetContent side="right" hideOverlay>
                    <SheetTitle>Titolo</SheetTitle>
                    <SheetDescription>Descrizione</SheetDescription>
                </SheetContent>
            </Sheet>,
        );
        expect(overlay()).toBeNull();
        expect(screen.getByRole('dialog')).toHaveClass(
            ...ENTER_EXIT,
            'data-[state=open]:slide-in-from-right',
            'data-[state=closed]:slide-out-to-right',
        );
    });
});
