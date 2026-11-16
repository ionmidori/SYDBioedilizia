'use client';

import { Check, Circle } from 'lucide-react';
import { getPasswordChecks, type PasswordChecks } from '@/lib/validation/auth-schema';
import { cn } from '@/lib/utils';

const RULES: ReadonlyArray<{ key: keyof PasswordChecks; label: string }> = [
    { key: 'length', label: 'Almeno 10 caratteri' },
    { key: 'lowercase', label: 'Una lettera minuscola' },
    { key: 'uppercase', label: 'Una lettera maiuscola' },
    { key: 'number', label: 'Un numero' },
    { key: 'symbol', label: 'Un simbolo' },
];

/**
 * Live checklist of the password rules. Presentational only: the real
 * validation lives in `signupSchema` / `newPasswordSchema` and in the Firebase
 * project policy. Meaning is conveyed by text + icon, not by colour alone.
 */
export function PasswordChecklist({ password }: { password: string }) {
    const checks = getPasswordChecks(password);
    return (
        <ul aria-label="Requisiti password" className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {RULES.map(({ key, label }) => {
                const met = checks[key];
                return (
                    <li
                        key={key}
                        data-met={met}
                        className={cn('flex items-center gap-1.5 text-xs', met ? 'text-success-ink' : 'text-ink-muted')}
                    >
                        {met ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Circle className="w-3.5 h-3.5" aria-hidden="true" />}
                        <span>{label}</span>
                        <span className="sr-only">{met ? ' (soddisfatto)' : ' (non ancora soddisfatto)'}</span>
                    </li>
                );
            })}
        </ul>
    );
}
