import * as React from 'react';
import type { StatusTone } from '@/lib/brand/tokens.generated';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASS } from './status-badge';

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone: StatusTone;
  title?: React.ReactNode;
}

/**
 * Inline message box. Errors interrupt assistive technologies (role="alert");
 * the other tones are announced politely (role="status").
 */
export function Alert({ tone, title, children, className, ...props }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg border p-4 text-sm', STATUS_TONE_CLASS[tone], className)}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
    </div>
  );
}
