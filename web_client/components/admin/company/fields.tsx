'use client';

import { useState, type HTMLInputTypeAttribute, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { COMPANY_ICONS } from '@/lib/company-info/icons';
import { parseLines } from '@/lib/admin/company-blocks';
import type { CompanyIssue } from '@/lib/admin/company-info-logic';
import { iconNameSchema, type IconName } from '@/types/company-info';

/** The id of the input at `path` in the company info: the one `validateCompanyInfo` reports as `fieldId`. */
export function fieldId(...path: (string | number)[]): string {
    return `company-${path.join('-')}`;
}

/** The message of the first problem on this input, if any. */
export function issueOf(issues: CompanyIssue[], id: string): string | undefined {
    return issues.find((issue) => issue.fieldId === id)?.message;
}

/** Every problem of one place of the company info (a whole list can have several). */
export function issuesOf(issues: CompanyIssue[], id: string): string[] {
    return issues.filter((issue) => issue.fieldId === id).map((issue) => issue.message);
}

/** The first problem on this input or on one of its entries (`places` → `places-3`). */
export function issueUnder(issues: CompanyIssue[], id: string): string | undefined {
    return issues.find((issue) => issue.fieldId === id || issue.fieldId.startsWith(`${id}-`))?.message;
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
    /** The field lost focus: a value that must be applied once, not on every key. */
    onBlur?: () => void;
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
    onBlur,
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
                onBlur={onBlur}
                maxLength={maxLength}
                readOnly={readOnly}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy(id, error, hint)}
                className={`${CONTROL} ${error ? 'border-danger' : 'border-line focus:border-primary'}`}
            />
            <Notes id={id} error={error} hint={hint} />
        </div>
    );
}

/** Move up / move down / delete for a row of a list; `subject` completes the accessible names ("il blocco 2"). */
export function RowControls({
    subject,
    index,
    count,
    onMove,
    onRemove,
    removeDisabledReason,
}: {
    subject: string;
    index: number;
    count: number;
    onMove: (from: number, to: number) => void;
    onRemove: () => void;
    /** Set when the row cannot be deleted: the button is disabled and says why. */
    removeDisabledReason?: string;
}) {
    const button =
        'inline-flex size-11 items-center justify-center rounded-xl border border-line text-ink hover:bg-surface disabled:opacity-40 cursor-pointer focus:outline-hidden focus-visible:ring-2 ring-ring';
    return (
        <div className="flex shrink-0 items-center gap-1">
            <button type="button" className={button} disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Sposta su ${subject}`}>
                <ArrowUp className="size-4" aria-hidden />
            </button>
            <button type="button" className={button} disabled={index >= count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Sposta giù ${subject}`}>
                <ArrowDown className="size-4" aria-hidden />
            </button>
            <button
                type="button"
                className={button}
                disabled={!!removeDisabledReason}
                title={removeDisabledReason}
                onClick={onRemove}
                aria-label={`Elimina ${subject}`}
            >
                <Trash2 className="size-4" aria-hidden />
            </button>
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
                className={`${CONTROL} ${error ? 'border-danger' : 'border-line focus:border-primary'}`}
            />
            <Notes id={id} error={error} hint={hint} />
        </div>
    );
}

/**
 * One line per entry. Typed text is kept as typed (a new line must be possible to type) and the
 * entries are parsed from it; it re-reads the entries when they change from outside.
 */
export function LinesField({
    id,
    label,
    items,
    onItems,
    error,
    hint = 'Una voce per riga: le righe vuote si scartano.',
}: {
    id: string;
    label: string;
    items: string[];
    onItems: (items: string[]) => void;
    error?: string;
    hint?: string;
}) {
    const [text, setText] = useState(items.join('\n'));
    // The entries changed from outside (two blocks swapped, a type conversion): show them, not the old text.
    const typed = parseLines(text);
    // Both sides normalized the same way: an entry the typed text cannot reproduce (a trailing space, a line break) must not reset it forever.
    const given = parseLines(items.join('\n'));
    if (typed.length !== given.length || typed.some((item, i) => item !== given[i])) setText(items.join('\n'));
    return (
        <TextAreaField
            id={id}
            label={label}
            value={text}
            onChange={(next) => {
                setText(next);
                onItems(parseLines(next));
            }}
            error={error}
            hint={hint}
            rows={Math.max(3, text.split('\n').length)}
        />
    );
}

export function SelectField({
    id,
    label,
    value,
    onChange,
    options,
    error,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    error?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={`${CONTROL} ${error ? 'border-danger' : 'border-line focus:border-primary'}`}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <Notes id={id} error={error} />
        </div>
    );
}

/** What each icon of the closed set looks like, in words (the stored names are the icons' identifiers). */
export const ICON_LABELS: Record<IconName, string> = {
    Coins: 'Monete',
    FileText: 'Documento',
    Sparkles: 'Scintille',
    Wrench: 'Chiave inglese',
    Award: 'Premio',
    Shield: 'Scudo',
    Leaf: 'Foglia',
    LayoutDashboard: 'Pannello',
    Wand2: 'Bacchetta magica',
    HardHat: 'Casco',
    CheckCircle: 'Spunta',
    Phone: 'Telefono',
    Clock: 'Orologio',
    MapPin: 'Segnaposto',
    Hammer: 'Martello',
    Home: 'Casa',
};

/** The icon of a card or a category: a pick from the closed set the site can draw, with a preview. */
export function IconSelect({
    id,
    label,
    value,
    onChange,
    error,
}: {
    id: string;
    label: string;
    value: IconName;
    onChange: (icon: IconName) => void;
    error?: string;
}) {
    const Icon = COMPANY_ICONS[value];
    return (
        <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
                <SelectField
                    id={id}
                    label={label}
                    value={value}
                    onChange={(next) => onChange(next as IconName)}
                    options={iconNameSchema.options.map((name) => ({ value: name, label: ICON_LABELS[name] }))}
                    error={error}
                />
            </div>
            <span aria-hidden className="mb-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-primary-ink">
                {Icon && <Icon className="size-5" />}
            </span>
        </div>
    );
}

/** "Add a row" button of a list: the visible text is its accessible name. */
export function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-xl border border-line text-sm text-ink hover:bg-surface disabled:opacity-50 cursor-pointer focus:outline-hidden focus-visible:ring-2 ring-ring"
        >
            <Plus className="size-4" aria-hidden /> {children}
        </button>
    );
}

/** The heading of a group of fields inside a tab. */
export function GroupTitle({ id, children }: { id: string; children: ReactNode }) {
    return (
        <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-primary-ink">
            {children}
        </h2>
    );
}
