'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Hammer, Facebook, Instagram, Linkedin, Twitter, Mail, MapPin, Phone, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
        <footer className="bg-[#020617] border-t border-white/5 pt-20 pb-10 relative overflow-hidden">

            {/* Decorative Glow */}
            <div className="absolute bottom-0 left-0 w-full h-[500px] bg-gradient-to-t from-blue-900/10 to-transparent pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">

                    {/* Brand Column */}
                    <div className="space-y-6">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="bg-gradient-to-br from-blue-600 to-cyan-500 p-2 rounded-lg">
                                <Hammer className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                                Renovation<span className="font-light">AI</span>
                            </span>
                        </Link>
                        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                            Rivoluzioniamo il modo di progettare e ristrutturare casa. Tecnologia AI all'avanguardia per risultati garantiti e senza sorprese.
                        </p>
                        <div className="flex gap-4">
                            {[Facebook, Instagram, Linkedin, Twitter].map((Icon, i) => (
                                <a
                                    key={i}
                                    href="#"
                                    className="w-10 h-10 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/10 transition-all duration-300"
                                    aria-label={`Social Media Link ${i}`}
                                >
                                    <Icon className="w-4 h-4" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-white font-semibold mb-6">Esplora</h4>
                        <ul className="space-y-4">
                            {['Home', 'Servizi', 'Portfolio', 'Chi Siamo', 'Blog'].map((item) => (
                                <li key={item}>
                                    <Link href="#" className="text-slate-400 hover:text-blue-400 transition-colors text-sm">
                                        {item}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h4 className="text-white font-semibold mb-6">Contatti</h4>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3 text-slate-400 text-sm">
                                <MapPin className="w-5 h-5 text-blue-500 shrink-0" />
                                <span>Via dell'Innovazione 42,<br />20100 Milano (MI)</span>
                            </li>
                            <li className="flex items-center gap-3 text-slate-400 text-sm">
                                <Phone className="w-5 h-5 text-blue-500 shrink-0" />
                                <span>+39 02 123 4567</span>
                            </li>
                            <li className="flex items-center gap-3 text-slate-400 text-sm">
                                <Mail className="w-5 h-5 text-blue-500 shrink-0" />
                                <span>info@renovationai.it</span>
                            </li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div>
                        <h4 className="text-white font-semibold mb-6">Newsletter</h4>
                        <p className="text-slate-400 text-sm mb-4">
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
                                        "w-full bg-slate-900 border rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-colors",
                                        status === 'error' ? "border-red-500 focus:border-red-500" : "border-white/10 focus:border-blue-500"
                                    )}
                                    disabled={status === 'loading' || status === 'success'}
                                    aria-label="Email address for newsletter"
                                />
                            </div>

                            <Button
                                variant="premium"
                                className="w-full relative overflow-hidden"
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

                <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-slate-500 text-sm">
                        © {currentYear} Renovation AI. Tutti i diritti riservati.
                    </p>
                    <div className="flex gap-6 text-sm text-slate-500">
                        <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <Link href="#" className="hover:text-white transition-colors">Termini di Servizio</Link>
                        <Link href="#" className="hover:text-white transition-colors">Cookie Policy</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
