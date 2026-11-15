'use client';

import { Plus, Trash2 } from 'lucide-react';
import { fieldId, issueOf, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import type { Address, Identity } from '@/types/company-info';

const EMPTY_ADDRESS: Address = { street: '', postal_code: '', city: '', region: '', country: 'IT' };

/** Name, legal data, contacts and address: what the footer, the legal pages, the quotes and the assistant show. */
export function IdentityTab({ info, onChange, issues }: TabProps) {
    const { identity } = info;
    const set = (patch: Partial<Identity>) => onChange({ identity: { ...identity, ...patch } });
    const setAddress = (patch: Partial<Address>) => set({ address: { ...identity.address, ...patch } });
    const setLegalAddress = (patch: Partial<Address>) =>
        set({ legal_address: { ...(identity.legal_address ?? EMPTY_ADDRESS), ...patch } });
    const text = (id: string, label: string, value: string, onValue: (v: string) => void, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
        <TextField id={id} label={label} value={value} onChange={onValue} error={issueOf(issues, id)} {...extra} />
    );
    const renderAddressFields = (key: 'address' | 'legal_address', address: Address, update: (patch: Partial<Address>) => void) => (
        <div className="grid gap-4 md:grid-cols-2">
            {text(fieldId('identity', key, 'street'), 'Via e numero civico', address.street, (street) => update({ street }), { maxLength: 120 })}
            {text(fieldId('identity', key, 'postal_code'), 'CAP', address.postal_code, (postal_code) => update({ postal_code }), {
                maxLength: 10,
                inputMode: 'numeric',
            })}
            {text(fieldId('identity', key, 'city'), 'Città', address.city, (city) => update({ city }), { maxLength: 120 })}
            {text(fieldId('identity', key, 'region'), 'Provincia (sigla)', address.region, (region) => update({ region }), { maxLength: 10 })}
            {text(fieldId('identity', key, 'country'), 'Paese (2 lettere)', address.country, (country) => update({ country }), { maxLength: 2 })}
        </div>
    );

    return (
        <div className="space-y-8">
            <section aria-labelledby="company-identity-company" className="space-y-4">
                <h2 id="company-identity-company" className="text-sm font-semibold uppercase tracking-wide text-primary-ink">
                    Dati societari
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {text(fieldId('identity', 'name'), 'Nome commerciale', identity.name, (name) => set({ name }), { maxLength: 120 })}
                    {text(fieldId('identity', 'legal_name'), 'Ragione sociale', identity.legal_name, (legal_name) => set({ legal_name }), { maxLength: 120 })}
                    {text(fieldId('identity', 'vat_id'), 'Partita IVA', identity.vat_id, (vat_id) => set({ vat_id }), {
                        maxLength: 11,
                        inputMode: 'numeric',
                        hint: '11 cifre, senza "IT".',
                    })}
                </div>
            </section>

            <section aria-labelledby="company-identity-contacts" className="space-y-4">
                <h2 id="company-identity-contacts" className="text-sm font-semibold uppercase tracking-wide text-primary-ink">
                    Contatti
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {text(fieldId('identity', 'phone'), 'Telefono', identity.phone, (phone) => set({ phone }), {
                        maxLength: 30,
                        type: 'tel',
                        inputMode: 'tel',
                        hint: 'Da 6 a 15 cifre, con o senza +39. Diventa il link «Chiama» del sito e della chat.',
                    })}
                    {text(fieldId('identity', 'whatsapp'), 'WhatsApp', identity.whatsapp ?? '', (value) => set({ whatsapp: value.trim() === '' ? null : value }), {
                        maxLength: 30,
                        type: 'tel',
                        inputMode: 'tel',
                        hint: 'Lascialo vuoto se non usi WhatsApp.',
                    })}
                    {text(fieldId('identity', 'email'), 'Email', identity.email, (email) => set({ email }), {
                        maxLength: 120,
                        type: 'email',
                        inputMode: 'email',
                    })}
                </div>
            </section>

            <section aria-labelledby="company-identity-legal-address" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="company-identity-legal-address" className="text-sm font-semibold uppercase tracking-wide text-primary-ink">
                        Sede legale
                    </h2>
                    {identity.legal_address ? (
                        <button
                            type="button"
                            onClick={() => set({ legal_address: null })}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-danger-ink hover:bg-surface-muted focus:outline-hidden focus-visible:ring-2 ring-ring cursor-pointer"
                        >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Rimuovi sede legale
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => set({ legal_address: { ...EMPTY_ADDRESS } })}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-primary-ink hover:bg-surface-muted focus:outline-hidden focus-visible:ring-2 ring-ring cursor-pointer"
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            Aggiungi sede legale
                        </button>
                    )}
                </div>
                {identity.legal_address ? (
                    renderAddressFields('legal_address', identity.legal_address, setLegalAddress)
                ) : (
                    <p className="text-sm text-ink-muted">
                        Nessuna sede legale separata impostata (verrà mostrata solo la sede operativa).
                    </p>
                )}
            </section>

            <section aria-labelledby="company-identity-address" className="space-y-4">
                <h2 id="company-identity-address" className="text-sm font-semibold uppercase tracking-wide text-primary-ink">
                    Sede operativa
                </h2>
                {renderAddressFields('address', identity.address, setAddress)}
            </section>
        </div>
    );
}
