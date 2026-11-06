import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Previous/next button of the desktop gallery row. */
export function RowArrow({
    direction,
    disabled,
    onClick,
}: {
    direction: 'prev' | 'next';
    disabled: boolean;
    onClick: () => void;
}) {
    const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={direction === 'prev' ? 'Progetti precedenti' : 'Progetti successivi'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-luxury-gold/30 text-luxury-gold transition-colors hover:bg-luxury-gold/10 hover:border-luxury-gold disabled:opacity-30 disabled:pointer-events-none"
        >
            <Icon className="w-5 h-5" aria-hidden="true" />
        </button>
    );
}
