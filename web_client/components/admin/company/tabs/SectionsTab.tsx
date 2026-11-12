'use client';

import { BlocksEditor } from '@/components/admin/company/BlocksEditor';
import { AddButton, fieldId, issueOf, issuesOf, RowControls, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import { followSlug, moveItem } from '@/lib/admin/company-info-logic';
import type { Section } from '@/types/company-info';

const SECTIONS_ID = fieldId('sections');

const questions = (count: number) => `${count} ${count === 1 ? 'domanda' : 'domande'}`;

/**
 * The sections of information (guarantees, payments, permits…). The fixed ones can be emptied but not deleted,
 * the assistant looks them up by their slug; new ones can be added without creating a page of the site.
 */
export function SectionsTab({ info, saved, onChange, issues }: TabProps) {
    const { sections, faq } = info;
    const savedSlugs = new Set(saved.sections.map((section) => section.slug));
    const problems = issuesOf(issues, SECTIONS_ID);

    const update = (index: number, patch: Partial<Section>) => {
        const old = sections[index].slug;
        const next = patch.slug ?? old;
        // The questions linked to the section follow its slug, unless that would be ambiguous.
        const follows =
            next !== old && old !== '' && next !== '' && sections.filter((s) => s.slug === old).length === 1 && !sections.some((s, i) => i !== index && s.slug === next);
        onChange({
            sections: sections.map((section, i) => (i === index ? { ...section, ...patch } : section)),
            ...(follows && { faq: faq.map((item) => (item.section_slug === old ? { ...item, section_slug: next } : item)) }),
        });
    };

    return (
        <div id={SECTIONS_ID} tabIndex={-1} className="space-y-6 focus:outline-hidden">
            <p className="text-sm text-ink-muted">
                Ogni sezione raccoglie un tipo di informazione (garanzie, pagamenti, permessi…). Una sezione vuota vale
                «informazione mancante»: l&apos;assistente lo dice e propone telefono ed email.
            </p>
            {problems.length > 0 && (
                <div role="alert" className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-ink">
                    {problems.map((problem) => (
                        <p key={problem}>{problem}</p>
                    ))}
                </div>
            )}

            <ol className="space-y-5">
                {sections.map((section, index) => {
                    const n = index + 1;
                    const linked = faq.filter((item) => item.section_slug === section.slug).length;
                    const reason = section.builtin
                        ? 'Sezione fissa: si può svuotare, non eliminare.'
                        : linked > 0
                          ? `Collegata a ${questions(linked)} delle FAQ: scollegale prima di eliminarla.`
                          : undefined;
                    const locked = section.builtin || savedSlugs.has(section.slug);
                    return (
                        <li key={index} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
                            <div className="flex flex-wrap items-start gap-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 md:grid-cols-2">
                                    <TextField
                                        id={fieldId('sections', index, 'title')}
                                        label={`Titolo della sezione ${n}`}
                                        value={section.title}
                                        maxLength={80}
                                        onChange={(title) =>
                                            update(index, { title, ...(!locked && { slug: followSlug(section.slug, section.title, title) }) })
                                        }
                                        error={issueOf(issues, fieldId('sections', index, 'title'))}
                                    />
                                    <TextField
                                        id={fieldId('sections', index, 'slug')}
                                        label={`Identificativo della sezione ${n}`}
                                        value={section.slug}
                                        maxLength={60}
                                        readOnly={locked}
                                        onChange={(slug) => update(index, { slug })}
                                        error={issueOf(issues, fieldId('sections', index, 'slug'))}
                                        hint={locked ? 'Non si cambia dopo il salvataggio.' : 'Minuscole, numeri e trattini.'}
                                    />
                                </div>
                                <div className="mt-6 flex items-center gap-2">
                                    {section.builtin && (
                                        <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs text-ink-muted">Sezione fissa</span>
                                    )}
                                    <RowControls
                                        subject={`la sezione ${n}`}
                                        index={index}
                                        count={sections.length}
                                        onMove={(from, to) => onChange({ sections: moveItem(sections, from, to) })}
                                        onRemove={() => onChange({ sections: sections.filter((_, i) => i !== index) })}
                                        removeDisabledReason={reason}
                                    />
                                </div>
                            </div>
                            {reason && !section.builtin && <p className="text-xs text-ink-muted">{reason}</p>}
                            {section.blocks.length === 0 && (
                                <p className="text-sm text-warning-ink">Vuota: l’assistente dirà che l’informazione manca e proporrà telefono ed email.</p>
                            )}
                            <BlocksEditor
                                id={fieldId('sections', index, 'blocks')}
                                label={`Contenuto della sezione ${n}`}
                                value={section.blocks}
                                onChange={(blocks) => update(index, { blocks })}
                                issues={issues}
                            />
                        </li>
                    );
                })}
            </ol>

            <AddButton onClick={() => onChange({ sections: [...sections, { slug: '', title: '', blocks: [], builtin: false }] })}>
                Aggiungi sezione
            </AddButton>
        </div>
    );
}
