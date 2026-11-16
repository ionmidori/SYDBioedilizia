'use client';

import { forwardRef, useId, useState, type ComponentPropsWithoutRef } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PasswordFieldProps extends Omit<ComponentPropsWithoutRef<typeof Input>, 'type'> {
    label: string;
    error?: string;
    invalid?: boolean;
}

/**
 * Password input with a show/hide toggle.
 *
 * Deliberately does NOT block paste or disable autofill: password managers are
 * a security feature, not something to defeat. The toggle is a real button
 * (`aria-pressed`, labelled in Italian) so it works with screen readers and
 * touch devices; it keeps the 44px touch target recommended for mobile.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
    ({ label, error, invalid, className, id, ...props }, ref) => {
        const autoId = useId();
        const inputId = id ?? autoId;
        const [visible, setVisible] = useState(false);

        return (
            <div className="space-y-1.5">
                <Label htmlFor={inputId} className="text-ink-muted">{label}</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" aria-hidden="true" />
                    <Input
                        {...props}
                        id={inputId}
                        ref={ref}
                        type={visible ? 'text' : 'password'}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={invalid || !!error || undefined}
                        className={cn('pl-10 pr-12 bg-surface-muted border-line-strong text-ink transition-all', className)}
                    />
                    <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        aria-label={visible ? 'Nascondi password' : 'Mostra password'}
                        aria-pressed={visible}
                        className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-subtle hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                </div>
                {error && <p className="text-xs text-danger-ink mt-1">{error}</p>}
            </div>
        );
    },
);
PasswordField.displayName = 'PasswordField';
