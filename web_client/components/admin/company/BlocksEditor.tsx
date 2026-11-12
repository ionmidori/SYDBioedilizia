'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

import { FAQAnswer } from '@/components/faq/FAQAnswer';
import { issueOf, RowControls, TextAreaField, TextField } from '@/components/admin/company/fields';
import { BLOCK_TYPES, convertBlock, emptyBlock, MAX_BLOCKS, parseLines, type BlockType } from '@/lib/admin/company-blocks';
import { moveItem, type CompanyIssue } from '@/lib/admin/company-info-logic';
import type { Block } from '@/types/company-info';

interface Props {
    /** Base of every input id: `${id}-${block}-text` is the id `validateCompanyInfo` reports for a block's text. */
    id: string;
    label: string;
    value: Block[];
    onChange: (blocks: Block[]) => void;
    /** The fewest blocks the text may have (a FAQ answer needs one). */
    minBlocks?: number;
    issues?: CompanyIssue[];
}

const BUTTON =
    'inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-xl border border-line text-sm hover:bg-surface disabled:opacity-50 cursor-pointer focus:outline-hidden focus-visible:ring-2 ring-ring';

/**
 * One line per entry. Typed text is kept as typed (a new line must be possible to type) and the
 * entries are parsed from it; it re-reads the entries when they change from outside.
 */
function LinesField({
    id,
    label,
    items,
    onItems,
    error,
}: {
    id: string;
    label: string;
    items: string[];
    onItems: (items: string[]) => void;
    error?: string;
}) {
    const [text, setText] = useState(items.join('\n'));
    // The entries changed from outside (two blocks swapped, a type conversion): show them, not the old text.
    const typed = parseLines(text);
    const given = items.filter((item) => item.trim() !== '');
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
            hint="Una voce per riga: le righe vuote si scartano."
            rows={Math.max(3, text.split('\n').length)}
        />
    );
}

/**
 * Edits a text of the company info as the blocks the site shows: paragraphs, notes, lists, definitions.
 * `**word**` makes bold text; "Anteprima" shows the blocks as the site does.
 */
export function BlocksEditor({ id, label, value, onChange, minBlocks = 0, issues = [] }: Props) {
    const [preview, setPreview] = useState(false);

    const replace = (index: number, block: Block) => onChange(value.map((b, i) => (i === index ? block : b)));
    const blockError = issueOf(issues, id);

    return (
        <fieldset id={id} tabIndex={-1} className="space-y-3 focus:outline-hidden">
            <legend className="text-sm font-medium text-ink">{label}</legend>
            {blockError && <p className="text-xs text-danger-ink">{blockError}</p>}

            <ol className="space-y-3">
                {value.map((block, index) => {
                    const n = index + 1;
                    const base = `${id}-${index}`;
                    return (
                        <li key={`${index}-${block.type}`} className="space-y-3 rounded-xl border border-line bg-surface-muted p-3">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                                <div className="space-y-1.5">
                                    <label htmlFor={`${base}-type`} className="block text-sm font-medium text-ink">
                                        Tipo del blocco {n}
                                    </label>
                                    <select
                                        id={`${base}-type`}
                                        value={block.type}
                                        onChange={(event) => replace(index, convertBlock(block, event.target.value as BlockType))}
                                        className="min-h-11 rounded-xl bg-surface border border-line px-3 text-base md:text-sm text-ink focus:outline-hidden focus-visible:ring-2 ring-ring"
                                    >
                                        {BLOCK_TYPES.map((t) => (
                                            <option key={t.type} value={t.type}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <RowControls
                                    subject={`il blocco ${n}`}
                                    index={index}
                                    count={value.length}
                                    onMove={(from, to) => onChange(moveItem(value, from, to))}
                                    onRemove={() => onChange(value.filter((_, i) => i !== index))}
                                    removeDisabledReason={value.length <= minBlocks ? 'Serve almeno un blocco' : undefined}
                                />
                            </div>

                            {block.type === 'ul' || block.type === 'ol' ? (
                                <LinesField
                                    id={`${base}-items`}
                                    label={`Voci del blocco ${n} (una per riga)`}
                                    items={block.items}
                                    onItems={(items) => replace(index, { ...block, items })}
                                    error={issueOf(issues, `${base}-items`)}
                                />
                            ) : block.type === 'definitions' ? (
                                <div className="space-y-3">
                                    {block.items.map((def, j) => (
                                        <div key={j} className="flex flex-wrap items-start gap-2">
                                            <div className="grid flex-1 min-w-[14rem] gap-3 md:grid-cols-2">
                                                <TextField
                                                    id={`${base}-items-${j}-term`}
                                                    label={`Termine ${j + 1} del blocco ${n}`}
                                                    value={def.term}
                                                    maxLength={120}
                                                    error={issueOf(issues, `${base}-items-${j}-term`)}
                                                    onChange={(term) =>
                                                        replace(index, { ...block, items: block.items.map((d, k) => (k === j ? { ...d, term } : d)) })
                                                    }
                                                />
                                                <TextField
                                                    id={`${base}-items-${j}-description`}
                                                    label={`Descrizione ${j + 1} del blocco ${n}`}
                                                    value={def.description}
                                                    maxLength={2000}
                                                    error={issueOf(issues, `${base}-items-${j}-description`)}
                                                    onChange={(description) =>
                                                        replace(index, { ...block, items: block.items.map((d, k) => (k === j ? { ...d, description } : d)) })
                                                    }
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className={`${BUTTON} mt-7`}
                                                disabled={block.items.length <= 1}
                                                onClick={() => replace(index, { ...block, items: block.items.filter((_, k) => k !== j) })}
                                                aria-label={`Elimina il termine ${j + 1} del blocco ${n}`}
                                            >
                                                Elimina
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className={BUTTON}
                                        disabled={block.items.length >= 30}
                                        onClick={() => replace(index, { ...block, items: [...block.items, { term: '', description: '' }] })}
                                        aria-label={`Aggiungi termine al blocco ${n}`}
                                    >
                                        <Plus className="size-4" aria-hidden /> Aggiungi termine
                                    </button>
                                </div>
                            ) : 'text' in block ? (
                                <TextAreaField
                                    id={`${base}-text`}
                                    label={`Testo del blocco ${n}`}
                                    value={block.text}
                                    maxLength={2000}
                                    rows={block.type === 'lead' ? 2 : 4}
                                    error={issueOf(issues, `${base}-text`)}
                                    onChange={(text) => replace(index, { ...block, text })}
                                />
                            ) : null}
                        </li>
                    );
                })}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className={BUTTON}
                    disabled={value.length >= MAX_BLOCKS}
                    onClick={() => onChange([...value, emptyBlock('p')])}
                >
                    <Plus className="size-4" aria-hidden /> Aggiungi blocco
                </button>
                <button type="button" className={BUTTON} aria-pressed={preview} onClick={() => setPreview((open) => !open)}>
                    Anteprima
                </button>
                <span className="text-xs text-ink-muted">Scrivi **così** per il grassetto.</span>
            </div>

            {preview && (
                <div data-testid={`${id}-preview`} className="rounded-xl border border-line bg-surface p-4 text-ink">
                    {value.length > 0 ? <FAQAnswer blocks={value} /> : <p className="text-sm text-ink-muted">Niente da mostrare.</p>}
                </div>
            )}
        </fieldset>
    );
}
