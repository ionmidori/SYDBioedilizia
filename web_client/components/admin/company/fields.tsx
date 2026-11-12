'use client';

import type { HTMLInputTypeAttribute } from 'react';

import type { CompanyIssue } from '@/lib/admin/company-info-logic';

/** The id of the input at `path` in the company info: the one `validateCompanyInfo` reports as `fieldId`. */
export function fieldId(...path: (string | number)[]): string {
    return `company-${path.join('-')}`;
}

/** The message of the first problem on this input, if any. */
export function issueOf(issues: CompanyIssue[], id: string): string | undefined {
    return issues.find((issue) => issue.fieldId === id)?.message;
}

const CONTROL =
    'w-full min-h-11 rounded-xl bg-surface border px-3 py-2 text-base md:text-sm text-ink focus:outline-hidden focus-visible:ring-2 ring-ring read-only:bg-surface-muted disabled:opacity-60';

interface FieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    hint?: string;
    maxLength?: number;
    readOnly?: boolean;
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
    const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
}

function Notes({ id, error, hint }: { id: string; error?: string; hint?: string }) {
    return (
        <>
            {hint && (
                <p id={`${id}-hint`} className="text-xs text-ink-muted">
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} className="text-xs text-danger-ink">
                    {error}
                </p>
            )}
        </>
    );
}

export function TextField({
    id,
    label,
    value,
    onChange,
    error,
    hint,
    maxLength,
    readOnly,
    type = 'text',
    inputMode,
}: FieldProps & { type?: HTMLInputTypeAttribute; inputMode?: 'numeric' | 'tel' | 'email' | 'text' }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <input
                id={id}
                type={type}
                inputMode={inputMode}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                maxLength={maxLength}
                readOnly={readOnly}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy(id, error, hint)}
                className={`${CONTROL} ${error ? 'border-danger' : 'border-line focus:border-accent'}`}
            />
            <Notes id={id} error={error} hint={hint} />
        </div>
    );
}

export function TextAreaField({
    id,
    label,
    value,
    onChange,
    error,
    hint,
    maxLength,
    readOnly,
    rows = 4,
}: FieldProps & { rows?: number }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <textarea
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={rows}
                maxLength={maxLength}
                readOnly={readOnly}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy(id, error, hint)}
                className={`${CONTROL} ${error ? 'border-danger' : 'border-line focus:border-accent'}`}
            />
            <Notes id={id} error={error} hint={hint} />
        </div>
    );
}
