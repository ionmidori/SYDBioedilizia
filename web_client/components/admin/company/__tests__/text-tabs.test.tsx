import React, { useState, type ComponentType } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { AboutTab } from '../tabs/AboutTab';
import { FaqTab } from '../tabs/FaqTab';
import { SectionsTab } from '../tabs/SectionsTab';
import type { TabProps } from '../types';
import { validateCompanyInfo } from '@/lib/admin/company-info-logic';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import type { CompanyInfo } from '@/types/company-info';

const copy = (): CompanyInfo => JSON.parse(JSON.stringify(SEED_COMPANY_INFO));

/**
 * The tab inside a parent that keeps the draft, like the editor does. `prepare` shapes the starting
 * company info, which is also the saved one; `seen.current` is the latest draft.
 */
function mount(Tab: ComponentType<TabProps>, prepare: (info: CompanyInfo) => void = () => undefined) {
    const start = copy();
    prepare(start);
    const saved = JSON.parse(JSON.stringify(start)) as CompanyInfo;
    const seen: { current: CompanyInfo } = { current: start };
    function Harness() {
        const [info, setInfo] = useState(start);
        seen.current = info;
        return (
            <Tab
                info={info}
                saved={saved}
                issues={validateCompanyInfo(info)}
                onChange={(patch) => setInfo((previous) => ({ ...previous, ...patch }))}
            />
        );
    }
    render(<Harness />);
    return seen;
}

const BUILTIN = 'garanzie';
const indexOfSection = (info: CompanyInfo, slug: string) => info.sections.findIndex((s) => s.slug === slug);

describe('SectionsTab', () => {
    it('shows a fixed section as such: slug locked, no way to delete it', () => {
        const seen = mount(SectionsTab);
        const n = indexOfSection(seen.current, BUILTIN) + 1;
        expect(screen.getAllByText('Sezione fissa').length).toBe(8);
        expect(screen.getByLabelText(`Identificativo della sezione ${n}`)).toHaveAttribute('readonly');
        expect(screen.getByRole('button', { name: `Elimina la sezione ${n}` })).toBeDisabled();
    });

    it('tells that an empty section makes the assistant say the information is missing', () => {
        mount(SectionsTab, (info) => {
            info.sections.forEach((s) => (s.blocks = []));
        });
        expect(screen.getAllByText(/Vuota: l’assistente dirà che l’informazione manca/).length).toBe(8);
    });

    it('adds a section whose slug follows its title, and lets the admin edit the slug while it is new', () => {
        const seen = mount(SectionsTab);
        const n = seen.current.sections.length + 1;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi sezione' }));
        fireEvent.change(screen.getByLabelText(`Titolo della sezione ${n}`), { target: { value: 'Assistenza Post-Vendita' } });
        expect(seen.current.sections[n - 1]).toMatchObject({ slug: 'assistenza-post-vendita', title: 'Assistenza Post-Vendita', builtin: false });
        const slug = screen.getByLabelText(`Identificativo della sezione ${n}`);
        expect(slug).not.toHaveAttribute('readonly');
        fireEvent.change(slug, { target: { value: 'post-vendita' } });
        expect(seen.current.sections[n - 1].slug).toBe('post-vendita');
    });

    it('locks the slug of a saved section that is not a fixed one', () => {
        const seen = mount(SectionsTab, (info) => {
            info.sections.push({ slug: 'extra', title: 'Extra', blocks: [], builtin: false });
        });
        const n = indexOfSection(seen.current, 'extra') + 1;
        expect(screen.getByLabelText(`Identificativo della sezione ${n}`)).toHaveAttribute('readonly');
        expect(screen.getByRole('button', { name: `Elimina la sezione ${n}` })).not.toBeDisabled();
    });

    it('deletes a section nothing refers to', () => {
        const seen = mount(SectionsTab, (info) => {
            info.sections.push({ slug: 'extra', title: 'Extra', blocks: [], builtin: false });
        });
        const n = indexOfSection(seen.current, 'extra') + 1;
        fireEvent.click(screen.getByRole('button', { name: `Elimina la sezione ${n}` }));
        expect(indexOfSection(seen.current, 'extra')).toBe(-1);
    });

    it('does not delete a section a FAQ is linked to, and says why', () => {
        const seen = mount(SectionsTab, (info) => {
            info.sections.push({ slug: 'extra', title: 'Extra', blocks: [], builtin: false });
            info.faq[0] = { ...info.faq[0], section_slug: 'extra' };
        });
        const n = indexOfSection(seen.current, 'extra') + 1;
        expect(screen.getByRole('button', { name: `Elimina la sezione ${n}` })).toBeDisabled();
        expect(screen.getByText(/Collegata a 1 domanda/)).toBeInTheDocument();
    });

    it('edits the content of a section with the block editor', () => {
        const seen = mount(SectionsTab, (info) => {
            info.sections[0].blocks = [];
        });
        const group = screen.getByRole('group', { name: 'Contenuto della sezione 1' });
        fireEvent.click(within(group).getByRole('button', { name: 'Aggiungi blocco' }));
        fireEvent.change(within(group).getByLabelText('Testo del blocco 1'), { target: { value: 'Dieci anni.' } });
        expect(seen.current.sections[0].blocks).toEqual([{ type: 'p', text: 'Dieci anni.' }]);
    });

    it('flags two sections with the same slug', () => {
        mount(SectionsTab, (info) => {
            info.sections.push({ ...info.sections[0], builtin: false });
        });
        expect(screen.getAllByText(/Sezione duplicata/).length).toBeGreaterThan(0);
    });
});

describe('FaqTab', () => {
    it('lists the categories in the select of each question', () => {
        const seen = mount(FaqTab);
        const names = seen.current.faq_categories.map((c) => c.name);
        const options = within(screen.getByLabelText('Categoria della domanda 1')).getAllByRole('option');
        expect(options.map((o) => o.textContent)).toEqual(names);
    });

    it('adds a question: the slug follows the question, the category is the first one, and it asks for an answer', () => {
        const seen = mount(FaqTab);
        const n = seen.current.faq.length + 1;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi domanda' }));
        fireEvent.change(screen.getByLabelText(`Domanda ${n}`), { target: { value: 'Quanto costa?' } });
        expect(seen.current.faq[n - 1]).toMatchObject({
            slug: 'quanto-costa',
            question: 'Quanto costa?',
            category: seen.current.faq_categories[0].name,
            section_slug: null,
        });
        expect(screen.getAllByText('Campo obbligatorio').length).toBeGreaterThan(0);
    });

    it('links a question to a section, and unlinks it', () => {
        const seen = mount(FaqTab, (info) => {
            info.faq = info.faq.map((f) => ({ ...f, section_slug: null }));
        });
        const select = screen.getByLabelText('Sezione collegata alla domanda 1');
        fireEvent.change(select, { target: { value: BUILTIN } });
        expect(seen.current.faq[0].section_slug).toBe(BUILTIN);
        fireEvent.change(select, { target: { value: '' } });
        expect(seen.current.faq[0].section_slug).toBeNull();
    });

    it('shows only the questions of the category picked, keeping their numbers', () => {
        const seen = mount(FaqTab, (info) => {
            info.faq_categories = [...info.faq_categories, { name: 'Vuota', icon: 'Home' }];
            info.faq[0] = { ...info.faq[0], category: 'Vuota' };
        });
        const total = seen.current.faq.length;
        expect(screen.getAllByLabelText(/^Domanda \d+$/)).toHaveLength(total);
        fireEvent.change(screen.getByLabelText('Mostra le domande di'), { target: { value: 'Vuota' } });
        expect(screen.getAllByLabelText(/^Domanda \d+$/)).toHaveLength(1);
        expect(screen.getByLabelText('Domanda 1')).toBeInTheDocument();
    });

    it('moves a question among the ones shown', () => {
        const seen = mount(FaqTab);
        const [first, second] = seen.current.faq.map((f) => f.slug);
        fireEvent.click(screen.getByRole('button', { name: 'Sposta giù la domanda 1' }));
        expect(seen.current.faq.slice(0, 2).map((f) => f.slug)).toEqual([second, first]);
    });

    it('does not delete a category a question uses, and deletes an unused one', () => {
        const seen = mount(FaqTab, (info) => {
            info.faq_categories = [...info.faq_categories, { name: 'Vuota', icon: 'Home' }];
        });
        const used = seen.current.faq_categories.findIndex((c) => seen.current.faq.some((f) => f.category === c.name)) + 1;
        expect(screen.getByRole('button', { name: `Elimina la categoria ${used}` })).toBeDisabled();
        const unused = seen.current.faq_categories.length;
        fireEvent.click(screen.getByRole('button', { name: `Elimina la categoria ${unused}` }));
        expect(seen.current.faq_categories.map((c) => c.name)).not.toContain('Vuota');
    });

    it('renames a category when the field is left, and the questions follow it', () => {
        const seen = mount(FaqTab);
        const oldName = seen.current.faq_categories[0].name;
        const usedBefore = seen.current.faq.filter((f) => f.category === oldName).length;
        expect(usedBefore).toBeGreaterThan(0);
        const field = screen.getByLabelText('Nome della categoria 1');
        fireEvent.change(field, { target: { value: 'Nuovo nome' } });
        expect(seen.current.faq_categories[0].name).toBe(oldName); // not before the field is left
        fireEvent.blur(field);
        expect(seen.current.faq_categories[0].name).toBe('Nuovo nome');
        expect(seen.current.faq.filter((f) => f.category === 'Nuovo nome')).toHaveLength(usedBefore);
        expect(validateCompanyInfo(seen.current)).toEqual([]);
    });

    it('adds a category with an icon', () => {
        const seen = mount(FaqTab);
        const count = seen.current.faq_categories.length;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi categoria' }));
        fireEvent.change(screen.getByLabelText(`Nome della categoria ${count + 1}`), { target: { value: 'Garanzie' } });
        fireEvent.blur(screen.getByLabelText(`Nome della categoria ${count + 1}`));
        fireEvent.change(screen.getByLabelText(`Icona della categoria ${count + 1}`), { target: { value: 'Shield' } });
        expect(seen.current.faq_categories[count]).toEqual({ name: 'Garanzie', icon: 'Shield' });
    });
});

describe('AboutTab', () => {
    it('edits the titles and the button', () => {
        const seen = mount(AboutTab);
        fireEvent.change(screen.getByLabelText('Titolo della pagina'), { target: { value: 'Chi è SYD' } });
        fireEvent.change(screen.getByLabelText('Testo del pulsante'), { target: { value: 'Chiedi un preventivo' } });
        fireEvent.change(screen.getByLabelText('Nota sotto il pulsante'), { target: { value: 'Il sopralluogo dopo.' } });
        expect(seen.current.about).toMatchObject({ title: 'Chi è SYD', cta_label: 'Chiedi un preventivo', cta_note: 'Il sopralluogo dopo.' });
    });

    it('edits each long text with the block editor', () => {
        const seen = mount(AboutTab, (info) => {
            info.about.intro = [];
        });
        const group = screen.getByRole('group', { name: 'Introduzione' });
        fireEvent.click(within(group).getByRole('button', { name: 'Aggiungi blocco' }));
        fireEvent.change(within(group).getByLabelText('Testo del blocco 1'), { target: { value: 'Siamo SYD.' } });
        expect(seen.current.about.intro).toEqual([{ type: 'p', text: 'Siamo SYD.' }]);
    });

    it('edits an excellence and its icon, and adds one', () => {
        const seen = mount(AboutTab);
        fireEvent.change(screen.getByLabelText('Titolo dell’eccellenza 1'), { target: { value: 'Qualità' } });
        fireEvent.change(screen.getByLabelText('Icona dell’eccellenza 1'), { target: { value: 'Award' } });
        expect(seen.current.about.excellences[0]).toMatchObject({ title: 'Qualità', icon: 'Award' });
        const count = seen.current.about.excellences.length;
        fireEvent.click(screen.getByRole('button', { name: 'Aggiungi eccellenza' }));
        expect(seen.current.about.excellences).toHaveLength(count + 1);
    });

    it('stops at the 12 excellences the page can hold', () => {
        mount(AboutTab, (info) => {
            info.about.excellences = Array.from({ length: 12 }, (_, i) => ({ title: `E${i}`, text: 't', icon: 'Award' as const }));
        });
        expect(screen.getByRole('button', { name: 'Aggiungi eccellenza' })).toBeDisabled();
    });
});
