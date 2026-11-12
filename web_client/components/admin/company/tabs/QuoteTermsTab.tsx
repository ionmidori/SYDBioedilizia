'use client';

import { fieldId, GroupTitle, issueOf, issueUnder, LinesField, TextAreaField, TextField } from '@/components/admin/company/fields';
import type { TabProps } from '@/components/admin/company/types';
import type { CompanyInfo } from '@/types/company-info';

type QuoteTerms = CompanyInfo['quote_terms'];

/** The conditions printed on every quote (PDF and email) and told by the assistant: validity, payments, disclaimer. */
export function QuoteTermsTab({ info, onChange, issues }: TabProps) {
    const terms = info.quote_terms;
    const set = (patch: Partial<QuoteTerms>) => onChange({ quote_terms: { ...terms, ...patch } });
    const id = (field: Extract<keyof QuoteTerms, string>) => fieldId('quote_terms', field);

    return (
        <div className="space-y-8">
            <section aria-labelledby="company-quote-terms-validity" className="space-y-4">
                <GroupTitle id="company-quote-terms-validity">Validità e pagamenti</GroupTitle>
                <div className="max-w-xs">
                    <TextField
                        id={id('validity_days')}
                        label="Validità del preventivo (giorni)"
                        type="number"
                        inputMode="numeric"
                        value={String(terms.validity_days)}
                        onChange={(value) => set({ validity_days: value.trim() === '' ? 0 : Number(value) })}
                        error={issueOf(issues, id('validity_days'))}
                    />
                </div>
                <LinesField
                    id={id('payment_terms')}
                    label="Condizioni di pagamento (una per riga)"
                    items={terms.payment_terms}
                    onItems={(payment_terms) => set({ payment_terms })}
                    error={issueUnder(issues, id('payment_terms'))}
                    hint="Da 1 a 10 righe, ad esempio gli acconti. Compaiono nel PDF del preventivo."
                />
            </section>

            <section aria-labelledby="company-quote-terms-texts" className="space-y-4">
                <GroupTitle id="company-quote-terms-texts">Testi del preventivo</GroupTitle>
                <TextAreaField
                    id={id('short_notice')}
                    label="Avviso breve"
                    value={terms.short_notice}
                    maxLength={2000}
                    rows={3}
                    onChange={(short_notice) => set({ short_notice })}
                    error={issueOf(issues, id('short_notice'))}
                />
                <TextField
                    id={id('disclaimer_title')}
                    label="Titolo dell’avvertenza"
                    value={terms.disclaimer_title}
                    maxLength={120}
                    onChange={(disclaimer_title) => set({ disclaimer_title })}
                    error={issueOf(issues, id('disclaimer_title'))}
                />
                <TextAreaField
                    id={id('disclaimer')}
                    label="Avvertenza"
                    value={terms.disclaimer}
                    maxLength={2000}
                    rows={4}
                    onChange={(disclaimer) => set({ disclaimer })}
                    error={issueOf(issues, id('disclaimer'))}
                />
                <TextField
                    id={id('signature_label')}
                    label="Etichetta della firma"
                    value={terms.signature_label}
                    maxLength={120}
                    onChange={(signature_label) => set({ signature_label })}
                    error={issueOf(issues, id('signature_label'))}
                />
            </section>
        </div>
    );
}
