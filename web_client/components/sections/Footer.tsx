'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, MapPin, Phone } from 'lucide-react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaXTwitter } from 'react-icons/fa6';
import { SydLogo } from '@/components/branding/SydLogo';
import { M3EasingFM } from '@/lib/m3-motion';
import { COMPANY } from '@/lib/company';

export function Footer() {
    const currentYear = new Date().getFullYear();
    const pathname = usePathname();

    // Footer reveal, once, as its top crosses 90% of the viewport.
    const reduceMotion = useReducedMotion();

    return (
        <motion.footer
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.6, ease: M3EasingFM.decelerate }}
            className="bg-luxury-bg border-t border-luxury-gold/10 pt-20 pb-10 relative overflow-hidden"
        >

            {/* Decorative Glow */}
            <div className="absolute bottom-0 left-0 w-full h-[500px] bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                {/* Esplora and Contatti always side by side (2 columns under the brand
                    on phone/tablet, 3 columns on desktop), with the same row rhythm. */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-12 gap-y-12 mb-16">

                    {/* Brand Column */}
                    <div className="col-span-2 lg:col-span-1 space-y-6">
                        <Link href="/" className="group">
                            <SydLogo className="group-hover:opacity-90 transition-opacity" />
                        </Link>
                        <p className="text-luxury-text/70 text-sm leading-relaxed max-w-xs font-light">
                            Rivoluzioniamo il modo di progettare e ristrutturare casa. Tecnologia AI all&apos;avanguardia per risultati garantiti e senza sorprese.
                        </p>
                        <div className="flex gap-4">
                            {[FaFacebookF, FaInstagram, FaLinkedinIn, FaXTwitter].map((Icon, i) => (
                                <a
                                    key={i}
                                    href="#"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 rounded-full bg-black/20 border border-luxury-gold/10 flex items-center justify-center text-luxury-teal hover:text-white hover:border-luxury-teal/50 hover:bg-luxury-teal hover:scale-110 transition-all duration-300"
                                    aria-label={`Social Media Link ${i}`}
                                >
                                    <Icon className="w-4 h-4" />
                                </a>
                            ))}
                        </div>

                    </div>

                    {/* Quick Links */}
                    <div className="min-w-0">
                        <h4 className="text-luxury-text font-serif font-bold mb-6 text-lg">Esplora</h4>
                        <ul className="space-y-3 text-sm leading-6">
                            {[
                                { label: 'Home', href: '/' },
                                { label: 'Servizi', href: pathname === '/' ? '#services' : '/#services' },
                                { label: 'Portfolio', href: pathname === '/' ? '#portfolio' : '/#portfolio' },
                                { label: 'Chi Siamo', href: '/chi-siamo' },
                                { label: 'Blog', href: '/blog' },
                                { label: 'FAQ', href: '/faq' },
                            ].map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="text-luxury-text/70 hover:text-luxury-gold transition-colors font-light">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact Info — icons sit on the first text line (mt-1 on a 24px line) */}
                    <div className="min-w-0">
                        <h4 className="text-luxury-text font-serif font-bold mb-6 text-lg">Contatti</h4>
                        <ul className="space-y-3 text-sm leading-6 text-luxury-text/70 font-light">
                            <li className="flex items-start gap-2 md:gap-3">
                                <MapPin className="w-4 h-4 mt-1 text-luxury-teal shrink-0" aria-hidden="true" />
                                <address className="not-italic min-w-0">
                                    {COMPANY.address.street},<br />{COMPANY.address.postalCode} {COMPANY.address.city}
                                    <span className="text-luxury-gold/60 text-xs block">P.IVA: {COMPANY.vatId}</span>
                                </address>
                            </li>
                            <li className="flex items-start gap-2 md:gap-3">
                                <Phone className="w-4 h-4 mt-1 text-luxury-teal shrink-0" aria-hidden="true" />
                                <span className="min-w-0">{COMPANY.phone}</span>
                            </li>
                            <li className="flex items-start gap-2 md:gap-3">
                                <Mail className="w-4 h-4 mt-1 text-luxury-teal shrink-0" aria-hidden="true" />
                                {/* <wbr> after "@": on a narrow column it wraps as "name@ / domain",
                                    not mid-word ("gmail.co / m"). */}
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                    {COMPANY.email.split('@')[0]}@<wbr />{COMPANY.email.split('@')[1]}
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-luxury-gold/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-luxury-text/40 text-sm font-light">
                        © {currentYear} SYD BIOEDILIZIA. Tutti i diritti riservati.
                    </p>
                    <div className="flex gap-6 text-sm text-luxury-text/40">
                        <Link href="/privacy" className="hover:text-luxury-gold transition-colors">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-luxury-gold transition-colors">Termini di Servizio</Link>
                        <Link href="/cookie-policy" className="hover:text-luxury-gold transition-colors">Cookie Policy</Link>
                    </div>
                </div>
            </div>

        </motion.footer>
    );
}
