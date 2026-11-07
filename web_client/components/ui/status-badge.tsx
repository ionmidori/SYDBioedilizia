import * as React from 'react';
import type { StatusTone } from '@/lib/brand/tokens.generated';
import { cn } from '@/lib/utils';

/**
 * Status colours per tone, on the semantic status roles (roles.tokens.json, family `status`).
 * Literal classes so Tailwind sees them; the Record type fails the build if a tone is added
 * to the tokens without a row here.
 */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  danger: 'border-danger/30 bg-danger-subtle text-danger-ink',
  warning: 'border-warning/30 bg-warning-subtle text-warning-ink',
  success: 'border-success/30 bg-success-subtle text-success-ink',
  info: 'border-info/30 bg-info-subtle text-info-ink',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
}

/** Small inline status label (quote state, payment, upload result...). */
export function StatusBadge({ tone, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_TONE_CLASS[tone], className)}
      {...props}
    />
  );
}
