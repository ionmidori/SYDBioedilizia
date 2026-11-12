'use client';

import { AddButton, fieldId, GroupTitle, issueOf, issueUnder, LinesField, RowControls, SelectField, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import { moveItem } from '@/lib/admin/company-info-logic';
import type { CompanyInfo } from '@/types/company-info';

type Locality = CompanyInfo['service_area']['localities'][number];

const MAX_LOCALITIES = 500;
const AREA_ID = fieldId('service_area');

/**
 * Where SYD works: a summary the assistant says, the comuni it serves (the assistant tells served from
 * not served by this list alone) and the neighbourhoods that belong to a comune.
 */
export function AreaTab({ info, onChange, issues }: TabProps) {
    const area = info.service_area;
    const setArea = (patch: Partial<typeof area>) => onChange({ service_area: { ...area, ...patch } });
    const setLocality = (index: number, patch: Partial<Locality>) =>
        setArea({ localities: area.localities.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
    // A whole-area problem (a locality of a comune not in the list, a repeated comune) is shown above the fields.
    const areaProblem = issueOf(issues, AREA_ID);

    return (
        <div id={AREA_ID} tabIndex={-1} className="space-y-8 focus:outline-hidden">
            {areaProblem && (
                <p role="alert" className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-ink">
                    {areaProblem}
                </p>
            )}

            <section aria-labelledby="company-area-places" className="space-y-4">
                <GroupTitle id="company-area-places">Comuni serviti</GroupTitle>
                <TextField
                    id={fieldId('service_area', 'summary')}
                    label="Riassunto della zona"
                    value={area.summary}
                    maxLength={120}
                    onChange={(summary) => setArea({ summary })}
                    error={issueOf(issues, fieldId('service_area', 'summary'))}
                    hint="Ad esempio: «Roma e provincia». È la frase con cui l'assistente dice dove lavora SYD."
                />
                <LinesField
                    id={fieldId('service_area', 'places')}
                    label="Comuni serviti (uno per riga)"
                    items={area.places}
                    onItems={(places) => setArea({ places })}
                    error={issueUnder(issues, fieldId('service_area', 'places'))}
                    hint="Un comune è servito solo se è in questo elenco. Si può incollare l'elenco intero."
                />
                <p className="text-sm text-ink-muted">
                    {area.places.length} {area.places.length === 1 ? 'comune' : 'comuni'}
                </p>
            </section>

            <section aria-labelledby="company-area-localities" className="space-y-4">
                <GroupTitle id="company-area-localities">Quartieri e frazioni</GroupTitle>
                <p className="text-sm text-ink-muted">Una località vale come il suo comune: «Trastevere» è servita perché «Roma» lo è.</p>
                <ol className="space-y-3">
                    {area.localities.map((locality, index) => {
                        const n = index + 1;
                        const known = area.places.includes(locality.comune);
                        const options = (known ? area.places : [locality.comune, ...area.places]).map((name) => ({ value: name, label: name }));
                        return (
                            <li key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted p-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 sm:grid-cols-2">
                                    <TextField
                                        id={fieldId('service_area', 'localities', index, 'name')}
                                        label={`Nome della località ${n}`}
                                        value={locality.name}
                                        maxLength={120}
                                        onChange={(name) => setLocality(index, { name })}
                                        error={issueOf(issues, fieldId('service_area', 'localities', index, 'name'))}
                                    />
                                    <SelectField
                                        id={fieldId('service_area', 'localities', index, 'comune')}
                                        label={`Comune della località ${n}`}
                                        value={locality.comune}
                                        options={options}
                                        onChange={(comune) => setLocality(index, { comune })}
                                        error={issueOf(issues, fieldId('service_area', 'localities', index, 'comune'))}
                                    />
                                </div>
                                <div className="mt-6">
                                    <RowControls
                                        subject={`la località ${n}`}
                                        index={index}
                                        count={area.localities.length}
                                        onMove={(from, to) => setArea({ localities: moveItem(area.localities, from, to) })}
                                        onRemove={() => setArea({ localities: area.localities.filter((_, i) => i !== index) })}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={area.localities.length >= MAX_LOCALITIES}
                    onClick={() => setArea({ localities: [...area.localities, { name: '', comune: area.places[0] ?? '' }] })}
                >
                    Aggiungi località
                </AddButton>
            </section>
        </div>
    );
}
