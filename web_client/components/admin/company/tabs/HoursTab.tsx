'use client';

import { AddButton, fieldId, GroupTitle, issueOf, RowControls, TextAreaField, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import { moveItem } from '@/lib/admin/company-info-logic';
import type { OpeningHours } from '@/types/company-info';

/** The most hours rows the backend accepts. */
const MAX_ROWS = 14;

/** Opening hours: rows of days and times, and a free note. The site and Google read the days they can understand. */
export function HoursTab({ info, onChange, issues }: TabProps) {
    const { hours } = info;
    const setRow = (index: number, patch: Partial<OpeningHours>) =>
        onChange({ hours: hours.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

    return (
        <div className="space-y-8">
            <section aria-labelledby="company-hours-rows" className="space-y-4">
                <GroupTitle id="company-hours-rows">Orari di apertura</GroupTitle>
                <p className="text-sm text-ink-muted">
                    Il sito e Google leggono giorni scritti come «Lun-Ven», «Sabato» o «Lun, Mer e Ven». Un testo diverso
                    («su appuntamento») resta solo come scritta e non va nei dati per Google.
                </p>
                {hours.length === 0 && <p className="text-sm text-ink-muted">Nessun orario: l&apos;assistente dirà che l&apos;informazione manca.</p>}
                <ol className="space-y-3">
                    {hours.map((row, index) => {
                        const n = index + 1;
                        return (
                            <li key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted p-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 sm:grid-cols-3">
                                    <TextField
                                        id={fieldId('hours', index, 'days')}
                                        label={`Giorni (riga ${n})`}
                                        value={row.days}
                                        maxLength={60}
                                        onChange={(days) => setRow(index, { days })}
                                        error={issueOf(issues, fieldId('hours', index, 'days'))}
                                    />
                                    <TextField
                                        id={fieldId('hours', index, 'opens')}
                                        label={`Apertura (riga ${n})`}
                                        type="time"
                                        value={row.opens}
                                        onChange={(opens) => setRow(index, { opens })}
                                        error={issueOf(issues, fieldId('hours', index, 'opens'))}
                                    />
                                    <TextField
                                        id={fieldId('hours', index, 'closes')}
                                        label={`Chiusura (riga ${n})`}
                                        type="time"
                                        value={row.closes}
                                        onChange={(closes) => setRow(index, { closes })}
                                        error={issueOf(issues, fieldId('hours', index, 'closes'))}
                                    />
                                </div>
                                <div className="mt-6">
                                    <RowControls
                                        subject={`la riga ${n}`}
                                        index={index}
                                        count={hours.length}
                                        onMove={(from, to) => onChange({ hours: moveItem(hours, from, to) })}
                                        onRemove={() => onChange({ hours: hours.filter((_, i) => i !== index) })}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={hours.length >= MAX_ROWS}
                    onClick={() => onChange({ hours: [...hours, { days: '', opens: '09:00', closes: '18:00' }] })}
                >
                    Aggiungi orario
                </AddButton>
            </section>

            <TextAreaField
                id={fieldId('hours_note')}
                label="Note sugli orari"
                value={info.hours_note}
                maxLength={300}
                rows={2}
                onChange={(hours_note) => onChange({ hours_note })}
                error={issueOf(issues, fieldId('hours_note'))}
                hint="Ad esempio chiusure estive o orari su appuntamento."
            />
        </div>
    );
}
