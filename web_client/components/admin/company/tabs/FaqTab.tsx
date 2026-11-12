'use client';

import { useState } from 'react';

import { BlocksEditor } from '@/components/admin/company/BlocksEditor';
import { AddButton, fieldId, GroupTitle, IconSelect, issueOf, RowControls, SelectField, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import { followSlug, moveItem } from '@/lib/admin/company-info-logic';
import type { CompanyInfo } from '@/types/company-info';

type Category = CompanyInfo['faq_categories'][number];
type Faq = CompanyInfo['faq'][number];

const MAX_FAQ = 200;
const MAX_CATEGORIES = 20;

const questions = (count: number) => `${count} ${count === 1 ? 'domanda' : 'domande'}`;

/** The name is applied when the field is left, not on every key: the questions follow the name they use. */
function CategoryName({ id, label, value, error, onCommit }: { id: string; label: string; value: string; error?: string; onCommit: (name: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <TextField
            id={id}
            label={label}
            value={draft ?? value}
            maxLength={40}
            error={error}
            onChange={setDraft}
            onBlur={() => {
                if (draft !== null && draft !== value) onCommit(draft);
                setDraft(null);
            }}
        />
    );
}

/** The frequently asked questions, in categories. A question can be linked to a section: the section's text is then part of its answer. */
export function FaqTab({ info, saved, onChange, issues }: TabProps) {
    const { faq, faq_categories: categories, sections } = info;
    const [filter, setFilter] = useState('');
    const savedSlugs = new Set(saved.faq.map((item) => item.slug));

    const setCategory = (index: number, patch: Partial<Category>) =>
        onChange({ faq_categories: categories.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
    const renameCategory = (index: number, name: string) => {
        const old = categories[index].name;
        // The questions name their category: they follow the rename, unless two categories share the old name.
        const follows = old !== '' && categories.filter((c) => c.name === old).length === 1;
        onChange({
            faq_categories: categories.map((c, i) => (i === index ? { ...c, name } : c)),
            ...(follows && { faq: faq.map((item) => (item.category === old ? { ...item, category: name } : item)) }),
        });
    };
    const setFaq = (index: number, patch: Partial<Faq>) => onChange({ faq: faq.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

    const shown = faq.map((item, index) => ({ item, index })).filter(({ item }) => filter === '' || item.category === filter);
    const categoryOptions = (current: string) =>
        (categories.some((c) => c.name === current) ? categories.map((c) => c.name) : [current, ...categories.map((c) => c.name)]).map((name) => ({
            value: name,
            label: name,
        }));
    const sectionOptions = (current: string) => [
        { value: '', label: 'Nessuna' },
        ...(current === '' || sections.some((s) => s.slug === current) ? [] : [{ value: current, label: `${current} (non esiste)` }]),
        ...sections.map((s) => ({ value: s.slug, label: s.title || s.slug })),
    ];

    return (
        <div className="space-y-10">
            <section aria-labelledby="company-faq-categories" className="space-y-4">
                <GroupTitle id="company-faq-categories">Categorie</GroupTitle>
                <ol className="space-y-3">
                    {categories.map((category, index) => {
                        const n = index + 1;
                        const used = faq.filter((item) => item.category === category.name).length;
                        const reason = used > 0 ? `Usata da ${questions(used)}.` : categories.length <= 1 ? 'Serve almeno una categoria.' : undefined;
                        return (
                            <li key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted p-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 sm:grid-cols-2">
                                    <CategoryName
                                        id={fieldId('faq_categories', index, 'name')}
                                        label={`Nome della categoria ${n}`}
                                        value={category.name}
                                        error={issueOf(issues, fieldId('faq_categories', index, 'name'))}
                                        onCommit={(name) => renameCategory(index, name)}
                                    />
                                    <IconSelect
                                        id={fieldId('faq_categories', index, 'icon')}
                                        label={`Icona della categoria ${n}`}
                                        value={category.icon}
                                        onChange={(icon) => setCategory(index, { icon })}
                                    />
                                </div>
                                <div className="mt-6 space-y-1">
                                    <RowControls
                                        subject={`la categoria ${n}`}
                                        index={index}
                                        count={categories.length}
                                        onMove={(from, to) => onChange({ faq_categories: moveItem(categories, from, to) })}
                                        onRemove={() => onChange({ faq_categories: categories.filter((_, i) => i !== index) })}
                                        removeDisabledReason={reason}
                                    />
                                    {reason && <p className="text-xs text-ink-muted">{reason}</p>}
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={categories.length >= MAX_CATEGORIES}
                    onClick={() => onChange({ faq_categories: [...categories, { name: '', icon: 'CheckCircle' }] })}
                >
                    Aggiungi categoria
                </AddButton>
            </section>

            <section aria-labelledby="company-faq-questions" className="space-y-4">
                <GroupTitle id="company-faq-questions">Domande</GroupTitle>
                <div className="max-w-xs">
                    <SelectField
                        id="company-faq-filter"
                        label="Mostra le domande di"
                        value={filter}
                        onChange={setFilter}
                        options={[{ value: '', label: 'Tutte le categorie' }, ...categories.map((c) => ({ value: c.name, label: c.name }))]}
                    />
                </div>
                <ol className="space-y-5">
                    {shown.map(({ item, index }, position) => {
                        const n = index + 1;
                        const locked = savedSlugs.has(item.slug);
                        return (
                            <li key={index} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="grid min-w-[14rem] flex-1 gap-3 md:grid-cols-2">
                                        <div className="md:col-span-2">
                                            <TextField
                                                id={fieldId('faq', index, 'question')}
                                                label={`Domanda ${n}`}
                                                value={item.question}
                                                maxLength={200}
                                                onChange={(question) =>
                                                    setFaq(index, { question, ...(!locked && { slug: followSlug(item.slug, item.question, question) }) })
                                                }
                                                error={issueOf(issues, fieldId('faq', index, 'question'))}
                                            />
                                        </div>
                                        <TextField
                                            id={fieldId('faq', index, 'slug')}
                                            label={`Identificativo della domanda ${n}`}
                                            value={item.slug}
                                            maxLength={60}
                                            readOnly={locked}
                                            onChange={(slug) => setFaq(index, { slug })}
                                            error={issueOf(issues, fieldId('faq', index, 'slug'))}
                                            hint={locked ? 'Non si cambia dopo il salvataggio.' : 'Minuscole, numeri e trattini.'}
                                        />
                                        <SelectField
                                            id={fieldId('faq', index, 'category')}
                                            label={`Categoria della domanda ${n}`}
                                            value={item.category}
                                            options={categoryOptions(item.category)}
                                            onChange={(category) => setFaq(index, { category })}
                                            error={issueOf(issues, fieldId('faq', index, 'category'))}
                                        />
                                        <SelectField
                                            id={fieldId('faq', index, 'section_slug')}
                                            label={`Sezione collegata alla domanda ${n}`}
                                            value={item.section_slug ?? ''}
                                            options={sectionOptions(item.section_slug ?? '')}
                                            onChange={(value) => setFaq(index, { section_slug: value === '' ? null : value })}
                                            error={issueOf(issues, fieldId('faq', index, 'section_slug'))}
                                        />
                                    </div>
                                    <div className="mt-6">
                                        <RowControls
                                            subject={`la domanda ${n}`}
                                            index={position}
                                            count={shown.length}
                                            onMove={(from, to) => onChange({ faq: moveItem(faq, shown[from].index, shown[to].index) })}
                                            onRemove={() => onChange({ faq: faq.filter((_, i) => i !== index) })}
                                        />
                                    </div>
                                </div>
                                <BlocksEditor
                                    id={fieldId('faq', index, 'answer')}
                                    label={`Risposta della domanda ${n}`}
                                    value={item.answer}
                                    minBlocks={1}
                                    onChange={(answer) => setFaq(index, { answer })}
                                    issues={issues}
                                />
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={faq.length >= MAX_FAQ}
                    onClick={() =>
                        onChange({
                            faq: [
                                ...faq,
                                {
                                    slug: '',
                                    question: '',
                                    category: filter !== '' ? filter : (categories[0]?.name ?? ''),
                                    answer: [{ type: 'p', text: '' }],
                                    section_slug: null,
                                },
                            ],
                        })
                    }
                >
                    Aggiungi domanda
                </AddButton>
            </section>
        </div>
    );
}
