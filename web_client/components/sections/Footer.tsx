'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Hammer, Facebook, Instagram, Linkedin, Twitter, Mail, MapPin, Phone, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SydLogo } from '@/components/branding/SydLogo';

export function Footer() {
    const currentYear = new Date().getFullYear();
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const sanitizeInput = (input: string) => {
        // Basic sanitization to prevent XSS (though React renders text safely by default)
        return input.replace(/[<>]/g, "").trim();
    };

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        if (status === 'loading') return;

        const cleanEmail = sanitizeInput(email);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanEmail)) {
            setStatus('error');
            setMessage('Inserisci un indirizzo email valido.');
            return;
        }

        setStatus('loading');

        // Simulate API call
        setTimeout(() => {
            // Here you would typically fetch to your API
            setStatus('success');
            setMessage('Grazie per l\'iscrizione!');
            setEmail('');

            // Reset after 3 seconds
            setTimeout(() => {
                setStatus('idle');
                setMessage('');
            }, 3000);
        }, 1500);
    };

    return (
        <footer className="bg-luxury-bg border-t border-luxury-gold/10 pt-20 pb-10 relative overflow-hidden">

            {/* Decorative Glow */}
            <div className="absolute bottom-0 left-0 w-full h-[500px] bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">

                    {/* Brand Column */}
                    <div className="space-y-6">
                        <Link href="/" className="group">
                            <SydLogo className="group-hover:opacity-90 transition-opacity" />
                        </Link>
                        <p className="text-luxury-text/70 text-sm leading-relaxed max-w-xs font-light">
                            Rivoluzioniamo il modo di progettare e ristrutturare casa. Tecnologia AI all'avanguardia per risultati garantiti e senza sorprese.
                        </p>
                        <div className="flex gap-4">
                            {[Facebook, Instagram, Linkedin, Twitter].map((Icon, i) => (
                                <a
                                    key={i}
                                    href="#"
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
                                { label: 'Servizi', href: '/#servizi' },
                                { label: 'Portfolio', href: '/#portfolio' },
                                { label: 'Chi Siamo', href: '/chi-siamo' },
                                { label: 'Blog', href: '/blog' },
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
                                <span>Via Quero, 132,<br />00123 Roma<br /><span className="text-luxury-gold/60 text-xs mt-1 block">P.IVA: 15714991005</span></span>
                            </li>
                            <li className="flex items-center gap-3 text-luxury-text/70 text-sm font-light">
                                <Phone className="w-5 h-5 text-luxury-teal shrink-0" />
                                <span>+39 375 5463599</span>
                            </li>
                            <li className="flex items-center gap-3 text-luxury-text/70 text-sm font-light">
                                <Mail className="w-5 h-5 text-luxury-teal shrink-0" />
                                <span>sydbioedilizia@gmail.com</span>
                            </li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div>
                        <h4 className="text-luxury-text font-serif font-bold mb-6 text-lg">Newsletter</h4>
                        <p className="text-luxury-text/70 text-sm mb-4 font-light">
                            Iscriviti per ricevere consigli di design e offerte esclusive.
                        </p>
                        <form className="space-y-3" onSubmit={handleSubscribe}>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (status === 'error') setStatus('idle');
                                    }}
                                    placeholder="La tua email"
                                    className={cn(
                                        "w-full bg-black/20 border rounded-lg px-4 py-3 text-sm text-luxury-text focus:outline-none transition-colors",
                                        status === 'error' ? "border-red-500 focus:border-red-500" : "border-luxury-gold/10 focus:border-luxury-teal"
                                    )}
                                    disabled={status === 'loading' || status === 'success'}
                                    aria-label="Email address for newsletter"
                                />
                            </div>

                            <Button
                                variant="premium"
                                className="w-full relative overflow-hidden bg-luxury-teal hover:bg-luxury-teal/90 text-white border-none"
                                disabled={status === 'loading' || status === 'success'}
                            >
                                {status === 'loading' ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Attendi...
                                    </span>
                                ) : status === 'success' ? (
                                    <span className="flex items-center gap-2 text-white">
                                        <CheckCircle className="w-4 h-4" />
                                        Iscritto!
                                    </span>
                                ) : (
                                    'Iscriviti'
                                )}
                            </Button>

                            {status === 'error' && (
                                <p className="text-xs text-red-400 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                                    <XCircle className="w-3 h-3" />
                                    {message}
                                </p>
                            )}
                        </form>
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

        </footer >
    );
}
