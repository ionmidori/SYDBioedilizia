/**
 * Clickable company contacts in the assistant's replies (Phase 141).
 *
 * The phone and the email the assistant writes become `tel:` / `mailto:` links by
 * code, never by the model: the numbers come from the company info (the same
 * identity the footer shows), and only an exact match becomes a link — never a
 * price, a measure or a quote number that merely looks like a phone.
 *
 * The matching is written without lookbehind (Safari < 16.4 throws on it): each
 * pattern captures the character before the contact (group 1) and the contact
 * itself (group 2).
 */
import { mailtoHref, telHref, whatsappHref } from '@/lib/company-info/format';
import type { Identity } from '@/types/company-info';

export interface ContactRule {
    /** Global pattern: group 1 is the character before the contact, group 2 the contact. */
    pattern: RegExp;
    href: string;
}

/** The separator a number may have between two digits: "333 123 4567", "333-123-4567". */
const SEPARATOR = '[\\s.\\-]?';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The digits of a number, without Italy's country code when it has one. */
function nationalDigits(number: string): string {
    const digits = number.replace(/\D/g, '');
    if (number.trim().startsWith('+') && digits.startsWith('39')) return digits.slice(2);
    return digits.startsWith('0039') ? digits.slice(4) : digits;
}

/** The number, with or without "+39" / "0039", not glued to other digits. */
function phoneRule(number: string, href: string): ContactRule {
    const national = nationalDigits(number).split('').join(SEPARATOR);
    return {
        pattern: new RegExp(`(^|[^\\d+])((?:(?:\\+|00)39${SEPARATOR})?${national})(?!\\d)`, 'g'),
        href,
    };
}

/** The address, whatever the case, not part of a longer address or domain. */
function emailRule(email: string): ContactRule {
    return {
        pattern: new RegExp(`(^|[^\\w.+-])(${escapeRegExp(email)})(?![\\w-]|\\.\\w)`, 'gi'),
        href: mailtoHref(email),
    };
}

/**
 * The links the company info allows. WhatsApp only when it is a number of its own:
 * written in a sentence, the same number as the phone cannot tell which was meant.
 */
export function contactRules(identity: Identity): ContactRule[] {
    const rules = [phoneRule(identity.phone, telHref(identity.phone)), emailRule(identity.email)];
    if (identity.whatsapp && whatsappHref(identity.whatsapp) !== whatsappHref(identity.phone)) {
        rules.push(phoneRule(identity.whatsapp, whatsappHref(identity.whatsapp)));
    }
    return rules;
}

interface Hit {
    start: number;
    end: number;
    href: string;
}

/** Every contact written in `text`, in order, without overlaps. */
function findHits(text: string, rules: ContactRule[]): Hit[] {
    const hits: Hit[] = [];
    for (const { pattern, href } of rules) {
        for (const match of text.matchAll(pattern)) {
            const start = (match.index ?? 0) + match[1].length;
            hits.push({ start, end: start + match[2].length, href });
        }
    }
    hits.sort((a, b) => a.start - b.start);
    const kept: Hit[] = [];
    let end = 0;
    for (const hit of hits) {
        if (hit.start >= end) {
            kept.push(hit);
            end = hit.end;
        }
    }
    return kept;
}

/** True when `text` writes one of the company contacts. */
export function mentionsCompanyContact(text: string, rules: ContactRule[]): boolean {
    return findHits(text, rules).length > 0;
}

/** The slice of an mdast node the plugin reads and writes. */
interface MdNode {
    type: string;
    value?: string;
    url?: string;
    children?: MdNode[];
}

/** Nodes whose text is already a link, code or markup: left exactly as written. */
const UNTOUCHED = new Set(['link', 'linkReference', 'inlineCode', 'code', 'image', 'imageReference', 'definition', 'html']);

function splitText(value: string, rules: ContactRule[]): MdNode[] {
    const nodes: MdNode[] = [];
    let from = 0;
    for (const { start, end, href } of findHits(value, rules)) {
        if (start > from) nodes.push({ type: 'text', value: value.slice(from, start) });
        nodes.push({ type: 'link', url: href, children: [{ type: 'text', value: value.slice(start, end) }] });
        from = end;
    }
    if (from < value.length || nodes.length === 0) nodes.push({ type: 'text', value: value.slice(from) });
    return nodes;
}

function linkChildren(parent: MdNode, rules: ContactRule[]): void {
    const next: MdNode[] = [];
    for (const child of parent.children ?? []) {
        if (UNTOUCHED.has(child.type)) {
            next.push(child);
        } else if (child.type === 'text' && child.value) {
            next.push(...splitText(child.value, rules));
        } else {
            if (child.children) linkChildren(child, rules);
            next.push(child);
        }
    }
    parent.children = next;
}

/** remark plugin: turns the company contacts of the rules into links. */
export function remarkCompanyLinks(rules: ContactRule[]) {
    return () => (tree: MdNode): void => {
        if (rules.length > 0) linkChildren(tree, rules);
    };
}
