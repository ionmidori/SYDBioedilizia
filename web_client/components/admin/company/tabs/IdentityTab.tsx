'use client';

import { fieldId, issueOf, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import type { Identity } from '@/types/company-info';

/** Name, legal data, contacts and address: what the footer, the legal pages, the quotes and the assistant show. */
export function IdentityTab({ info, onChange, issues }: TabProps) {
    const { identity } = info;
    const set = (patch: Partial<Identity>) => onChange({ identity: { ...identity, ...patch } });
    const setAddress = (patch: Partial<Identity['address']>) => set({ address: { ...identity.address, ...patch } });
    const text = (id: string, label: string, value: string, onValue: (v: string) => void, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
        <TextField id={id} label={label} value={value} onChange={onValue} error={issueOf(issues, id)} {...extra} />
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

            <section aria-labelledby="company-identity-address" className="space-y-4">
                <h2 id="company-identity-address" className="text-sm font-semibold uppercase tracking-wide text-primary-ink">
                    Sede
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {text(fieldId('identity', 'address', 'street'), 'Via e numero civico', identity.address.street, (street) => setAddress({ street }), { maxLength: 120 })}
                    {text(fieldId('identity', 'address', 'postal_code'), 'CAP', identity.address.postal_code, (postal_code) => setAddress({ postal_code }), {
                        maxLength: 10,
                        inputMode: 'numeric',
                    })}
                    {text(fieldId('identity', 'address', 'city'), 'Città', identity.address.city, (city) => setAddress({ city }), { maxLength: 120 })}
                    {text(fieldId('identity', 'address', 'region'), 'Provincia (sigla)', identity.address.region, (region) => setAddress({ region }), { maxLength: 10 })}
                    {text(fieldId('identity', 'address', 'country'), 'Paese (2 lettere)', identity.address.country, (country) => setAddress({ country }), { maxLength: 2 })}
                </div>
            </section>
        </div>
    );
}
