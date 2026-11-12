'use client';

import {
    AddButton,
    fieldId,
    GroupTitle,
    IconSelect,
    issueOf,
    issueUnder,
    RowControls,
    SelectField,
    TextAreaField,
    TextField,
} from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import { moveItem, slugify } from '@/lib/admin/company-info-logic';
import type { HomeService, ServiceItem } from '@/types/company-info';

const MAX_WORKS = 100;
const MAX_CARDS = 12;

const ACTIONS = [
    { value: 'chat', label: 'Apre la chat con l’assistente' },
    { value: 'dashboard', label: 'Porta all’area personale' },
];

/** The works SYD does (the assistant refuses a work that is not here) and the cards of the home page. */
export function ServicesTab({ info, onChange, issues }: TabProps) {
    const { services, home_services: cards } = info;
    const setServices = (patch: Partial<typeof services>) => onChange({ services: { ...services, ...patch } });
    const setWork = (index: number, patch: Partial<ServiceItem>) =>
        setServices({ items: services.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
    const setCard = (index: number, patch: Partial<HomeService>) =>
        onChange({ home_services: cards.map((card, i) => (i === index ? { ...card, ...patch } : card)) });
    const itemsProblem = issueOf(issues, fieldId('services', 'items'));
    const cardsProblem = issueOf(issues, fieldId('home_services'));

    return (
        <div className="space-y-10">
            <section aria-labelledby="company-services-works" className="space-y-4">
                <GroupTitle id="company-services-works">Lavori svolti</GroupTitle>
                <TextAreaField
                    id={fieldId('services', 'summary')}
                    label="Riassunto dei lavori"
                    value={services.summary}
                    maxLength={300}
                    rows={2}
                    onChange={(summary) => setServices({ summary })}
                    error={issueOf(issues, fieldId('services', 'summary'))}
                    hint="Descrive l'attività di SYD: è anche la descrizione che leggono i motori di ricerca."
                />
                <p className="text-sm text-ink-muted">
                    Un lavoro che non è in questo elenco non viene preventivato dall&apos;assistente: dice che SYD non lo indica
                    tra le sue attività e propone telefono ed email.
                </p>
                {itemsProblem && (
                    <p id={fieldId('services', 'items')} tabIndex={-1} role="alert" className="text-sm text-danger-ink">
                        {itemsProblem}
                    </p>
                )}
                <ol className="space-y-3">
                    {services.items.map((item, index) => {
                        const n = index + 1;
                        return (
                            <li key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted p-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 md:grid-cols-2">
                                    <TextField
                                        id={fieldId('services', 'items', index, 'title')}
                                        label={`Titolo del lavoro ${n}`}
                                        value={item.title}
                                        maxLength={80}
                                        onChange={(title) => setWork(index, { title })}
                                        error={issueOf(issues, fieldId('services', 'items', index, 'title'))}
                                    />
                                    <TextField
                                        id={fieldId('services', 'items', index, 'description')}
                                        label={`Descrizione del lavoro ${n}`}
                                        value={item.description}
                                        maxLength={300}
                                        onChange={(description) => setWork(index, { description })}
                                        error={issueOf(issues, fieldId('services', 'items', index, 'description'))}
                                    />
                                </div>
                                <div className="mt-6">
                                    <RowControls
                                        subject={`il lavoro ${n}`}
                                        index={index}
                                        count={services.items.length}
                                        onMove={(from, to) => setServices({ items: moveItem(services.items, from, to) })}
                                        onRemove={() => setServices({ items: services.items.filter((_, i) => i !== index) })}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={services.items.length >= MAX_WORKS}
                    onClick={() => setServices({ items: [...services.items, { title: '', description: '' }] })}
                >
                    Aggiungi lavoro
                </AddButton>
            </section>

            <section aria-labelledby="company-services-cards" className="space-y-4">
                <GroupTitle id="company-services-cards">Card della home</GroupTitle>
                {cardsProblem && (
                    <p id={fieldId('home_services')} tabIndex={-1} role="alert" className="text-sm text-danger-ink">
                        {cardsProblem}
                    </p>
                )}
                <ol className="space-y-3">
                    {cards.map((card, index) => {
                        const n = index + 1;
                        const base = (field: string) => fieldId('home_services', index, field);
                        return (
                            <li key={index} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted p-3">
                                <div className="grid min-w-[14rem] flex-1 gap-3 md:grid-cols-2">
                                    <TextField
                                        id={base('title')}
                                        label={`Titolo della card ${n}`}
                                        value={card.title}
                                        maxLength={120}
                                        onChange={(title) =>
                                            // The id follows the title until the admin sets one of their own.
                                            setCard(index, {
                                                title,
                                                id: card.id === '' || card.id === slugify(card.title) ? slugify(title) : card.id,
                                            })
                                        }
                                        error={issueOf(issues, base('title'))}
                                    />
                                    <TextField
                                        id={base('id')}
                                        label={`Identificativo della card ${n}`}
                                        value={card.id}
                                        maxLength={60}
                                        onChange={(id) => setCard(index, { id })}
                                        error={issueOf(issues, base('id'))}
                                        hint="Minuscole, numeri e trattini."
                                    />
                                    <div className="md:col-span-2">
                                        <TextAreaField
                                            id={base('description')}
                                            label={`Descrizione della card ${n}`}
                                            value={card.description}
                                            maxLength={2000}
                                            rows={3}
                                            onChange={(description) => setCard(index, { description })}
                                            error={issueOf(issues, base('description'))}
                                        />
                                    </div>
                                    <IconSelect
                                        id={base('icon')}
                                        label={`Icona della card ${n}`}
                                        value={card.icon}
                                        onChange={(icon) => setCard(index, { icon })}
                                        error={issueOf(issues, base('icon'))}
                                    />
                                    <SelectField
                                        id={base('action')}
                                        label={`Azione della card ${n}`}
                                        value={card.action}
                                        options={ACTIONS}
                                        onChange={(action) => setCard(index, { action: action as HomeService['action'] })}
                                        error={issueUnder(issues, base('action'))}
                                    />
                                </div>
                                <div className="mt-6">
                                    <RowControls
                                        subject={`la card ${n}`}
                                        index={index}
                                        count={cards.length}
                                        onMove={(from, to) => onChange({ home_services: moveItem(cards, from, to) })}
                                        onRemove={() => onChange({ home_services: cards.filter((_, i) => i !== index) })}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <AddButton
                    disabled={cards.length >= MAX_CARDS}
                    onClick={() =>
                        onChange({ home_services: [...cards, { id: '', title: '', description: '', icon: 'CheckCircle', action: 'chat' }] })
                    }
                >
                    Aggiungi card
                </AddButton>
            </section>
        </div>
    );
}
