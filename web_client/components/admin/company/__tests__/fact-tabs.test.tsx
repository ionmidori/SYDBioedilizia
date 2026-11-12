import React, { useState, type ComponentType } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { AreaTab } from '../tabs/AreaTab';
import { HoursTab } from '../tabs/HoursTab';
import { QuoteTermsTab } from '../tabs/QuoteTermsTab';
import { ServicesTab } from '../tabs/ServicesTab';
import { SiteVisitTab } from '../tabs/SiteVisitTab';
import type { TabProps } from '../types';
import { validateCompanyInfo } from '@/lib/admin/company-info-logic';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import type { CompanyInfo } from '@/types/company-info';

const copy = (): CompanyInfo => JSON.parse(JSON.stringify(SEED_COMPANY_INFO));

/** The tab inside a parent that keeps the draft, like the editor does; `seen` is the latest draft. */
function mount(Tab: ComponentType<TabProps>, edit: (info: CompanyInfo) => void = () => undefined) {
    const seen: { current: CompanyInfo } = { current: copy() };
    function Harness() {
        const [info, setInfo] = useState(seen.current);
        seen.current = info;
        return (
            <Tab
                info={info}
                saved={copy()}
                issues={validateCompanyInfo(info)}
                onChange={(patch) => setInfo((previous) => ({ ...previous, ...patch }))}
            />
        );
    }
    edit(seen.current);
    render(<Harness />);
    return seen;
}

describe('HoursTab', () => {
    it('adds an hours row with sensible times and an empty days text to fill', () => {
        const seen = mount(HoursTab);
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi orario' }));
        expect(seen.current.hours).toEqual([{ days: '', opens: '09:00', closes: '18:00' }]);
    });

    it('edits the days, the times and the note', () => {
        const seen = mount(HoursTab);
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi orario' }));
        fireEvent.change(screen.getByLabelText('Giorni (riga 1)'), { target: { value: 'Lun-Ven' } });
        fireEvent.change(screen.getByLabelText('Apertura (riga 1)'), { target: { value: '08:30' } });
        fireEvent.change(screen.getByLabelText('Chiusura (riga 1)'), { target: { value: '17:00' } });
        fireEvent.change(screen.getByLabelText('Note sugli orari'), { target: { value: 'Chiuso ad agosto' } });
        expect(seen.current.hours).toEqual([{ days: 'Lun-Ven', opens: '08:30', closes: '17:00' }]);
        expect(seen.current.hours_note).toBe('Chiuso ad agosto');
    });

    it('says when the closing time does not follow the opening time', () => {
        mount(HoursTab);
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi orario' }));
        fireEvent.change(screen.getByLabelText('Giorni (riga 1)'), { target: { value: 'Sabato' } });
        fireEvent.change(screen.getByLabelText('Chiusura (riga 1)'), { target: { value: '08:00' } });
        expect(screen.getByText("L'orario di chiusura deve seguire l'apertura")).toBeInTheDocument();
    });

    it('moves and removes rows', () => {
        const seen = mount(HoursTab);
        for (const days of ['Lun-Ven', 'Sabato']) {
            fireEvent.click(screen.getByRole('button', { name: 'Aggiungi orario' }));
            const row = screen.getAllByLabelText(/^Giorni \(riga/).length;
            fireEvent.change(screen.getByLabelText(`Giorni (riga ${row})`), { target: { value: days } });
        }
        fireEvent.click(screen.getByRole('button', { name: 'Sposta giù la riga 1' }));
        expect(seen.current.hours.map((h) => h.days)).toEqual(['Sabato', 'Lun-Ven']);
        fireEvent.click(screen.getByRole('button', { name: 'Elimina la riga 1' }));
        expect(seen.current.hours.map((h) => h.days)).toEqual(['Lun-Ven']);
    });
});

describe('AreaTab', () => {
    it('reads the comuni one per line, ignoring blank lines and spaces', () => {
        const seen = mount(AreaTab);
        fireEvent.change(screen.getByLabelText('Comuni serviti (uno per riga)'), { target: { value: 'Roma\n\nFiumicino \n' } });
        expect(seen.current.service_area.places).toEqual(['Roma', 'Fiumicino']);
        expect(screen.getByText('2 comuni')).toBeInTheDocument();
    });

    it('edits the summary of the area', () => {
        const seen = mount(AreaTab);
        fireEvent.change(screen.getByLabelText('Riassunto della zona'), { target: { value: 'Roma e dintorni' } });
        expect(seen.current.service_area.summary).toBe('Roma e dintorni');
    });

    it('adds a locality and picks its comune from the list', () => {
        const seen = mount(AreaTab);
        const before = seen.current.service_area.localities.length;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi località' }));
        const added = seen.current.service_area.localities[before];
        expect(added.comune).toBe(seen.current.service_area.places[0]);
        fireEvent.change(screen.getByLabelText(`Nome della località ${before + 1}`), { target: { value: 'Quartiere nuovo' } });
        fireEvent.change(screen.getByLabelText(`Comune della località ${before + 1}`), { target: { value: 'Fiumicino' } });
        expect(seen.current.service_area.localities[before]).toEqual({ name: 'Quartiere nuovo', comune: 'Fiumicino' });
    });

    it('flags a locality whose comune left the list', () => {
        mount(AreaTab);
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi località' }));
        fireEvent.change(screen.getByLabelText('Comuni serviti (uno per riga)'), { target: { value: 'Fiumicino' } });
        expect(screen.getByText(/Località di un comune non in elenco/)).toBeInTheDocument();
    });
});

describe('ServicesTab', () => {
    it('edits the summary and reorders the works', () => {
        const seen = mount(ServicesTab);
        fireEvent.change(screen.getByLabelText('Riassunto dei lavori'), { target: { value: 'Solo interni' } });
        expect(seen.current.services.summary).toBe('Solo interni');
        const [first, second] = seen.current.services.items.map((i) => i.title);
        fireEvent.click(screen.getByRole('button', { name: 'Sposta giù il lavoro 1' }));
        expect(seen.current.services.items.slice(0, 2).map((i) => i.title)).toEqual([second, first]);
    });

    it('adds and edits a work', () => {
        const seen = mount(ServicesTab);
        const count = seen.current.services.items.length;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi lavoro' }));
        fireEvent.change(screen.getByLabelText(`Titolo del lavoro ${count + 1}`), { target: { value: 'Impianti' } });
        expect(seen.current.services.items[count]).toEqual({ title: 'Impianti', description: '' });
    });

    it('changes the icon and the action of a home card', () => {
        const seen = mount(ServicesTab);
        fireEvent.change(screen.getByLabelText('Icona della card 1'), { target: { value: 'Hammer' } });
        fireEvent.change(screen.getByLabelText('Azione della card 1'), { target: { value: 'chat' } });
        expect(seen.current.home_services[0]).toMatchObject({ icon: 'Hammer', action: 'chat' });
    });

    it('gives a new home card an id made from its title, until the admin sets one', () => {
        const seen = mount(ServicesTab);
        const count = seen.current.home_services.length;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi card' }));
        fireEvent.change(screen.getByLabelText(`Titolo della card ${count + 1}`), { target: { value: 'Città più belle' } });
        expect(seen.current.home_services[count].id).toBe('citta-piu-belle');
        fireEvent.change(screen.getByLabelText(`Identificativo della card ${count + 1}`), { target: { value: 'mia-card' } });
        fireEvent.change(screen.getByLabelText(`Titolo della card ${count + 1}`), { target: { value: 'Altro titolo' } });
        expect(seen.current.home_services[count].id).toBe('mia-card');
    });
});

describe('SiteVisitTab', () => {
    it('edits the site visit as blocks', () => {
        const seen = mount(SiteVisitTab);
        const blocks = seen.current.site_visit.length;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi blocco' }));
        fireEvent.change(screen.getByLabelText(`Testo del blocco ${blocks + 1}`), { target: { value: 'Si chiede per email.' } });
        expect(seen.current.site_visit[blocks]).toEqual({ type: 'p', text: 'Si chiede per email.' });
    });
});

describe('QuoteTermsTab', () => {
    it('edits the validity as a number and the payment terms by lines', () => {
        const seen = mount(QuoteTermsTab);
        fireEvent.change(screen.getByLabelText('Validità del preventivo (giorni)'), { target: { value: '45' } });
        expect(seen.current.quote_terms.validity_days).toBe(45);
        fireEvent.change(screen.getByLabelText('Condizioni di pagamento (una per riga)'), { target: { value: '40% alla firma\n60% a fine lavori' } });
        expect(seen.current.quote_terms.payment_terms).toEqual(['40% alla firma', '60% a fine lavori']);
    });

    it('flags an empty validity', () => {
        mount(QuoteTermsTab);
        fireEvent.change(screen.getByLabelText('Validità del preventivo (giorni)'), { target: { value: '' } });
        expect(screen.getByText('Valore troppo basso')).toBeInTheDocument();
    });

    it('edits the texts of the quote', () => {
        const seen = mount(QuoteTermsTab);
        fireEvent.change(screen.getByLabelText('Titolo dell’avvertenza'), { target: { value: 'Natura' } });
        fireEvent.change(screen.getByLabelText('Etichetta della firma'), { target: { value: 'Firma' } });
        expect(seen.current.quote_terms).toMatchObject({ disclaimer_title: 'Natura', signature_label: 'Firma' });
    });
});
