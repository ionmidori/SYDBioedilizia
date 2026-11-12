'use client';

import { BlocksEditor } from '@/components/admin/company/BlocksEditor';
import { AddButton, fieldId, GroupTitle, IconSelect, issueOf, RowControls, TextAreaField, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import { moveItem } from '@/lib/admin/company-info-logic';
import type { About } from '@/types/company-info';

const MAX_EXCELLENCES = 12;

type TextKey = {
    [K in keyof About]: About[K] extends string ? K : never;
}[keyof About];

/** The /chi-siamo page: every title and text of it. The layout and the animations are fixed. */
export function AboutTab({ info, onChange, issues }: TabProps) {
    const { about } = info;
    const set = (patch: Partial<About>) => onChange({ about: { ...about, ...patch } });
    const text = (key: TextKey, label: string, maxLength: number, hint?: string) => (
        <TextField
            id={fieldId('about', key)}
            label={label}
            value={about[key]}
            maxLength={maxLength}
            onChange={(value) => set({ [key]: value })}
            error={issueOf(issues, fieldId('about', key))}
            hint={hint}
        />
    );
    const blocks = (key: 'intro' | 'philosophy' | 'services_intro' | 'why_choose', label: string) => (
        <BlocksEditor id={fieldId('about', key)} label={label} value={about[key]} onChange={(value) => set({ [key]: value })} issues={issues} />
    );
    const setExcellence = (index: number, patch: Partial<About['excellences'][number]>) =>
        set({ excellences: about.excellences.map((e, i) => (i === index ? { ...e, ...patch } : e)) });

    return (
        <div className="space-y-10">
            <section aria-labelledby="company-about-head" className="space-y-4">
                <GroupTitle id="company-about-head">Testata e storia</GroupTitle>
                <div className="grid gap-4 md:grid-cols-2">
                    {text('title', 'Titolo della pagina', 120)}
                    {text('subtitle', 'Sottotitolo', 120)}
                </div>
                {blocks('intro', 'Introduzione')}
            </section>

            <section aria-labelledby="company-about-philosophy" className="space-y-4">
                <GroupTitle id="company-about-philosophy">Filosofia ed eccellenze</GroupTitle>
                <div className="grid gap-4 md:grid-cols-2">
                    {text('philosophy_title', 'Titolo della filosofia', 120)}
                    {text('excellences_title', 'Titolo delle eccellenze', 120)}
                </div>
                {blocks('philosophy', 'Filosofia')}
                <ol className="space-y-3">
                    {about.excellences.map((excellence, index) => {
                        const n = index + 1;
                        return (
                            <li key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted p-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 md:grid-cols-2">
                                    <TextField
                                        id={fieldId('about', 'excellences', index, 'title')}
                                        label={`Titolo dell’eccellenza ${n}`}
                                        value={excellence.title}
                                        maxLength={120}
                                        onChange={(title) => setExcellence(index, { title })}
                                        error={issueOf(issues, fieldId('about', 'excellences', index, 'title'))}
                                    />
                                    <IconSelect
                                        id={fieldId('about', 'excellences', index, 'icon')}
                                        label={`Icona dell’eccellenza ${n}`}
                                        value={excellence.icon}
                                        onChange={(icon) => setExcellence(index, { icon })}
                                    />
                                    <div className="md:col-span-2">
                                        <TextAreaField
                                            id={fieldId('about', 'excellences', index, 'text')}
                                            label={`Testo dell’eccellenza ${n}`}
                                            value={excellence.text}
                                            maxLength={2000}
                                            rows={2}
                                            onChange={(value) => setExcellence(index, { text: value })}
                                            error={issueOf(issues, fieldId('about', 'excellences', index, 'text'))}
                                        />
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <RowControls
                                        subject={`l’eccellenza ${n}`}
                                        index={index}
                                        count={about.excellences.length}
                                        onMove={(from, to) => set({ excellences: moveItem(about.excellences, from, to) })}
                                        onRemove={() => set({ excellences: about.excellences.filter((_, i) => i !== index) })}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={about.excellences.length >= MAX_EXCELLENCES}
                    onClick={() => set({ excellences: [...about.excellences, { title: '', text: '', icon: 'Award' }] })}
                >
                    Aggiungi eccellenza
                </AddButton>
            </section>

            <section aria-labelledby="company-about-services" className="space-y-4">
                <GroupTitle id="company-about-services">Servizi</GroupTitle>
                <div className="grid gap-4 md:grid-cols-2">
                    {text('services_title', 'Titolo dei servizi', 120)}
                    {text('services_subtitle', 'Sottotitolo dei servizi', 120)}
                </div>
                {blocks('services_intro', 'Introduzione ai servizi')}
                <p className="text-sm text-ink-muted">L&apos;elenco dei servizi della pagina è quello dei lavori svolti (scheda Lavori).</p>
            </section>

            <section aria-labelledby="company-about-why" className="space-y-4">
                <GroupTitle id="company-about-why">Perché sceglierci</GroupTitle>
                {text('why_title', 'Titolo del perché sceglierci', 120)}
                {blocks('why_choose', 'Perché sceglierci')}
                <div className="grid gap-4 md:grid-cols-2">
                    {text('cta_label', 'Testo del pulsante', 60, 'Il pulsante apre la chat per chiedere il preventivo.')}
                    {text('cta_note', 'Nota sotto il pulsante', 300, 'Ad esempio come si chiede il sopralluogo.')}
                </div>
            </section>
        </div>
    );
}
