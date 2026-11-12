import { Download, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import { mailtoHref, telHref, whatsappHref } from '@/lib/company-info/format';
import { VCARD_PATH } from '@/lib/company-info/vcard';
import type { Identity } from '@/types/company-info';

interface Action {
    label: string;
    href: string;
    Icon: LucideIcon;
    /** Opens in a new tab (WhatsApp). */
    external?: boolean;
    /** Saved as a file (the contact card). */
    download?: boolean;
}

const ACTION_CLASS =
    'inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-line bg-surface text-ink text-sm font-medium ' +
    'hover:bg-primary-subtle hover:text-primary-ink transition-colors ' +
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Quick ways to reach SYD, shown under a reply that writes a company contact:
 * call, WhatsApp, email, and the contact card for the address book. Every
 * number and address comes from the company info.
 */
export function ContactActions({ identity }: { identity: Identity }) {
    const actions: Action[] = [
        { label: 'Chiama', href: telHref(identity.phone), Icon: Phone },
        ...(identity.whatsapp
            ? [{ label: 'WhatsApp', href: whatsappHref(identity.whatsapp), Icon: MessageCircle, external: true }]
            : []),
        { label: 'Email', href: mailtoHref(identity.email), Icon: Mail },
        { label: 'Salva il contatto di SYD', href: VCARD_PATH, Icon: Download, download: true },
    ];

    return (
        <div role="group" aria-label="Contatta SYD" className="mt-2 flex flex-wrap gap-2">
            {actions.map(({ label, href, Icon, external, download }) => (
                <a
                    key={label}
                    href={href}
                    className={ACTION_CLASS}
                    {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
                    {...(download && { download: true })}
                >
                    <Icon className="w-4 h-4 text-primary-ink" aria-hidden="true" />
                    {label}
                </a>
            ))}
        </div>
    );
}
