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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-16">

                    {/* Brand Column */}
                    <div className="space-y-6">
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
                    <div>
                        <h4 className="text-luxury-text font-serif font-bold mb-6 text-lg">Esplora</h4>
                        <ul className="space-y-4">
                            {[
                                { label: 'Home', href: '/' },
                                { label: 'Servizi', href: pathname === '/' ? '#services' : '/#services' },
                                { label: 'Portfolio', href: pathname === '/' ? '#portfolio' : '/#portfolio' },
                                { label: 'Chi Siamo', href: '/chi-siamo' },
                                { label: 'Blog', href: '/blog' },
                                { label: 'FAQ', href: '/faq' },
                            ].map((item) => (
                                <li key={item.label}>
                                    <Link href={item.href} className="text-luxury-text/70 hover:text-luxury-gold transition-colors text-sm font-light">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h4 className="text-luxury-text font-serif font-bold mb-6 text-lg">Contatti</h4>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3 text-luxury-text/70 text-sm font-light">
                                <MapPin className="w-5 h-5 text-luxury-teal shrink-0" />
                                <span>{COMPANY.address.street},<br />{COMPANY.address.postalCode} {COMPANY.address.city}<br /><span className="text-luxury-gold/60 text-xs mt-1 block">P.IVA: {COMPANY.vatId}</span></span>
                            </li>
                            <li className="flex items-center gap-3 text-luxury-text/70 text-sm font-light">
                                <Phone className="w-5 h-5 text-luxury-teal shrink-0" />
                                <span>{COMPANY.phone}</span>
                            </li>
                            <li className="flex items-center gap-3 text-luxury-text/70 text-sm font-light">
                                <Mail className="w-5 h-5 text-luxury-teal shrink-0" />
                                <span>{COMPANY.email}</span>
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
