'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, Download, Mail, MapPin, Phone } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { M3EasingFM } from '@/lib/m3-motion';
import { useCompanyHours, useCompanyIdentity } from '@/components/providers/CompanyIdentityProvider';
import { formatHoursRow, mailtoHref, telHref } from '@/lib/company-info/format';
import { VCARD_PATH } from '@/lib/company-info/vcard';

export function Footer() {
    const currentYear = new Date().getFullYear();
    const pathname = usePathname();
    const identity = useCompanyIdentity();
    const hoursInfo = useCompanyHours();
    const hoursNote = hoursInfo?.hoursNote.trim() ?? '';

    // Footer reveal, once, as its top crosses 90% of the viewport.
    const reduceMotion = useReducedMotion();

    return (
        <motion.footer
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.6, ease: M3EasingFM.decelerate }}
            className="surface-inverse border-t border-line pt-20 pb-[max(2.5rem,env(safe-area-inset-bottom))] relative overflow-clip"
        >

            {/* Decorative Glow */}
            <div className="absolute bottom-0 left-0 w-full h-[500px] bg-gradient-to-t from-shade/40 to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                {/* Esplora and Contatti always side by side (2 columns under the brand
                    on phone/tablet, 3 columns on desktop), with the same row rhythm. */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-12 gap-y-12 mb-16">

                    {/* Brand Column */}
                    <div className="col-span-2 lg:col-span-1 space-y-6">
                        <Link href="/" className="group block w-fit">
                            <BrandLogo variant="full" className="h-20 md:h-24 group-hover:opacity-90 transition-opacity" />
                        </Link>
                        <p className="text-ink-muted text-sm leading-relaxed max-w-xs tracking-[0.01em]">
                            Rivoluzioniamo il modo di progettare e ristrutturare casa. Tecnologia AI all&apos;avanguardia per risultati garantiti e senza sorprese.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="min-w-0">
                        <h2 className="text-ink font-serif font-bold mb-6 text-lg">Esplora</h2>
                        <ul className="space-y-1 md:space-y-1.5 text-sm leading-relaxed tracking-[0.01em]">
                            {[
                                { label: 'Home', href: '/' },
                                { label: 'Servizi', href: pathname === '/' ? '#services' : '/#services' },
                                { label: 'Progetti', href: '/progetti' },
                                { label: 'Chi Siamo', href: '/chi-siamo' },
                                { label: 'Blog', href: '/blog' },
                                { label: 'FAQ', href: '/faq' },
                            ].map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="inline-flex items-center min-h-11 md:min-h-7 py-1 text-ink-muted hover:text-accent-ink transition-colors">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact Info — icons sit aligned with link text */}
                    {identity && (
                    <div className="min-w-0">
                        <h2 className="text-ink font-serif font-bold mb-6 text-lg">Contatti</h2>
                        <ul className="space-y-1 md:space-y-1.5 text-sm leading-relaxed tracking-[0.01em] text-ink-muted">
                            <li className="flex items-start gap-2 md:gap-3 py-1">
                                <MapPin className="w-4 h-4 mt-1 text-primary-ink shrink-0" aria-hidden="true" />
                                <address className="not-italic min-w-0">
                                    {identity.address.street},<br />{identity.address.postal_code} {identity.address.city}
                                    <span className="text-accent-ink text-xs block mt-0.5 tabular-nums">P.IVA: {identity.vat_id}</span>
                                </address>
                            </li>
                            <li className="flex items-start gap-2 md:gap-3">
                                <Phone className="w-4 h-4 mt-3.5 md:mt-1.5 text-primary-ink shrink-0" aria-hidden="true" />
                                <a href={telHref(identity.phone)} className="inline-flex items-center min-h-11 md:min-h-7 py-1 min-w-0 tabular-nums hover:text-accent-ink transition-colors">
                                    {identity.phone}
                                </a>
                            </li>
                            <li className="flex items-start gap-2 md:gap-3">
                                <Mail className="w-4 h-4 mt-3.5 md:mt-1.5 text-primary-ink shrink-0" aria-hidden="true" />
                                {/* <wbr> after "@": on a narrow column it wraps as "name@ / domain",
                                    not mid-word ("gmail.co / m"). */}
                                <a href={mailtoHref(identity.email)} className="inline-flex items-center min-h-11 md:min-h-7 py-1 min-w-0 [overflow-wrap:anywhere] hover:text-accent-ink transition-colors">
                                    {identity.email.split('@')[0]}@<wbr />{identity.email.split('@')[1]}
                                </a>
                            </li>
                            {hoursInfo && hoursInfo.hours.length > 0 && (
                                <li className="flex items-start gap-2 md:gap-3 py-1">
                                    <Clock className="w-4 h-4 mt-1 text-primary-ink shrink-0" aria-hidden="true" />
                                    <div className="min-w-0">
                                        <span className="sr-only">Orari di apertura: </span>
                                        <ul className="space-y-0.5 tabular-nums">
                                            {hoursInfo.hours.map((row, index) => (
                                                <li key={`${row.days}-${index}`}>
                                                    {formatHoursRow(row)}
                                                </li>
                                            ))}
                                        </ul>
                                        {hoursNote && (
                                            <span className="text-accent-ink text-xs block mt-0.5 break-words">
                                                {hoursNote}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            )}
                            <li className="flex items-start gap-2 md:gap-3">
                                <Download className="w-4 h-4 mt-3.5 md:mt-1.5 text-primary-ink shrink-0" aria-hidden="true" />
                                <a href={VCARD_PATH} download className="inline-flex items-center min-h-11 md:min-h-7 py-1 min-w-0 hover:text-accent-ink transition-colors">
                                    Salva il contatto di SYD
                                </a>
                            </li>
                        </ul>
                    </div>
                    )}
                </div>

                <div className="border-t border-line pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-ink-subtle text-sm tracking-[0.01em]">
                        © {currentYear} SYD BIOEDILIZIA. Tutti i diritti riservati.
                    </p>
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-ink-subtle">
                        <Link href="/privacy" className="inline-flex items-center min-h-11 md:min-h-7 py-1 hover:text-accent-ink transition-colors">Informativa sulla Privacy</Link>
                        <Link href="/terms" className="inline-flex items-center min-h-11 md:min-h-7 py-1 hover:text-accent-ink transition-colors">Termini di Servizio</Link>
                        <Link href="/cookie-policy" className="inline-flex items-center min-h-11 md:min-h-7 py-1 hover:text-accent-ink transition-colors">Cookie Policy</Link>
                    </div>
                </div>
            </div>

        </motion.footer>
    );
}
