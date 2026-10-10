import { cn } from '@/lib/utils';

export function StatusChip({ label, className, testId }: { label: string; className: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap',
        className,
      )}
    >
      {label}
    </span>
  );
}
