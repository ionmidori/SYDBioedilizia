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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-xs transition-colors hover:bg-primary-subtle hover:text-primary-ink hover:border-primary/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
        >
            <Icon className="w-5 h-5" aria-hidden="true" />
        </button>
    );
}
