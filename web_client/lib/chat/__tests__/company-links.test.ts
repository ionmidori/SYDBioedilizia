import { contactRules, mentionsCompanyContact, remarkCompanyLinks } from '@/lib/chat/company-links';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import type { Identity } from '@/types/company-info';

type Node = { type: string; value?: string; url?: string; children?: Node[] };

const { identity } = SEED_COMPANY_INFO;

/** Runs the plugin on a one-paragraph tree; returns the paragraph's children. */
function linkify(text: string, who: Identity = identity): Node[] {
    const paragraph: Node = { type: 'paragraph', children: [{ type: 'text', value: text }] };
    remarkCompanyLinks(contactRules(who))()({ type: 'root', children: [paragraph] });
    return paragraph.children!;
}

const links = (nodes: Node[]) =>
    nodes.filter((n) => n.type === 'link').map((n) => ({ url: n.url, text: n.children![0].value }));

/** The text of the nodes, joined: linking must never change what is written. */
const joined = (nodes: Node[]) => nodes.map((n) => n.value ?? n.children![0].value).join('');

describe('phone numbers', () => {
    it.each([
        ['Chiamaci al +39 375 5463599.', '+39 375 5463599'],
        ['Chiamaci al 375 546 3599 oggi', '375 546 3599'],
        ['Chiamaci al 3755463599', '3755463599'],
        ['Chiamaci allo 0039 375 5463599!', '0039 375 5463599'],
        ['Tel. (+39 375 5463599)', '+39 375 5463599'],
    ])('links the phone in "%s"', (text, shown) => {
        const nodes = linkify(text);
        expect(links(nodes)).toEqual([{ url: 'tel:+393755463599', text: shown }]);
        expect(joined(nodes)).toBe(text);
    });

    it.each([
        ['a price', 'Costa € 3.755,46 in tutto'],
        ['a quote number that starts like the phone', 'Preventivo n. 37554635990'],
        ['a number that ends like the phone', 'Codice 13755463599'],
        ['half a number (the reply is still streaming)', 'Chiamaci al +39 375 54'],
        ['an area', 'Sono 375 mq e 54 bagni'],
    ])('does not link %s', (_label, text) => {
        expect(links(linkify(text))).toEqual([]);
    });
});

describe('email', () => {
    it('links the company email whatever the case, to the lowercase address', () => {
        const nodes = linkify('Scrivi a SYDBioedilizia@Gmail.com, grazie.');
        expect(links(nodes)).toEqual([{ url: 'mailto:sydbioedilizia@gmail.com', text: 'SYDBioedilizia@Gmail.com' }]);
        expect(joined(nodes)).toBe('Scrivi a SYDBioedilizia@Gmail.com, grazie.');
    });

    it.each([
        'scrivi a sydbioedilizia@gmail.com.evil.io',
        'scrivi a sydbioedilizia@gmail.company',
        'scrivi a xsydbioedilizia@gmail.com',
        'scrivi a mario.rossi@example.com',
    ])('does not link "%s"', (text) => {
        expect(links(linkify(text))).toEqual([]);
    });
});

describe('WhatsApp', () => {
    it('is not a second link when it is the phone number', () => {
        expect(links(linkify('Chiamaci al 375 5463599'))).toHaveLength(1);
    });

    it('links a different WhatsApp number to wa.me', () => {
        const who: Identity = { ...identity, whatsapp: '+39 333 1112223' };
        expect(links(linkify('Scrivici su WhatsApp al 333 1112223', who))).toEqual([
            { url: 'https://wa.me/393331112223', text: '333 1112223' },
        ]);
    });
});

describe('what the plugin leaves alone', () => {
    const run = (children: Node[]): Node[] => {
        const paragraph: Node = { type: 'paragraph', children };
        remarkCompanyLinks(contactRules(identity))()({ type: 'root', children: [paragraph] });
        return paragraph.children!;
    };

    it('keeps a link the assistant wrote', () => {
        const written: Node = { type: 'link', url: 'https://esempio.it', children: [{ type: 'text', value: '375 5463599' }] };
        expect(run([written])).toEqual([written]);
    });

    it('keeps inline code', () => {
        const code: Node = { type: 'inlineCode', value: '3755463599' };
        expect(run([code])).toEqual([code]);
    });

    it('links a number inside bold text', () => {
        const strong: Node = { type: 'strong', children: [{ type: 'text', value: 'Tel 375 5463599' }] };
        run([strong]);
        expect(links(strong.children!)).toHaveLength(1);
    });

    it('does nothing without a company identity (no rules)', () => {
        const paragraph: Node = { type: 'paragraph', children: [{ type: 'text', value: 'Tel 375 5463599' }] };
        remarkCompanyLinks([])()({ type: 'root', children: [paragraph] });
        expect(paragraph.children).toEqual([{ type: 'text', value: 'Tel 375 5463599' }]);
    });
});

// Final review: the company info is edited in the admin console. A phone with no digits ("Chiamaci",
// "+39") made a pattern that matches the empty string everywhere (an empty link at almost every
// position); a too-short one ("06") linked dates. Such a number makes no rule.
describe('a phone the console saved with too few digits', () => {
    it.each(['Chiamaci', '+39', '06', '+39 12345'])('makes no phone rule from "%s"', (phone) => {
        const rules = contactRules({ ...identity, phone, whatsapp: phone });
        expect(rules.map((r) => r.href)).toEqual(['mailto:sydbioedilizia@gmail.com']);
        expect(mentionsCompanyContact('Ci vediamo il 12/06/2025 alle 10, chiamaci', rules)).toBe(false);
        expect(links(linkify('Ci vediamo il 12/06/2025, chiamaci', { ...identity, phone, whatsapp: null }))).toEqual([]);
    });

    it('still links a number with six digits or more', () => {
        expect(contactRules({ ...identity, phone: '06 123456', whatsapp: null }).map((r) => r.href)).toEqual([
            'tel:06123456',
            'mailto:sydbioedilizia@gmail.com',
        ]);
    });
});

describe('mentionsCompanyContact', () => {
    const rules = contactRules(identity);

    it('is true when the text writes a company contact', () => {
        expect(mentionsCompanyContact('Chiama il 375 5463599', rules)).toBe(true);
        expect(mentionsCompanyContact('Scrivi a sydbioedilizia@gmail.com', rules)).toBe(true);
    });

    it('is false otherwise, and with no rules', () => {
        expect(mentionsCompanyContact('Il bagno costa € 3.755,46', rules)).toBe(false);
        expect(mentionsCompanyContact('Chiama il 375 5463599', [])).toBe(false);
    });

    it('gives the same answer every time (no regex state kept between calls)', () => {
        const text = 'Chiama il 375 5463599';
        expect([1, 2, 3].map(() => mentionsCompanyContact(text, rules))).toEqual([true, true, true]);
    });
});
