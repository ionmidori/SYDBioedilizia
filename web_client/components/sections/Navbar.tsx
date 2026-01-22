'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@/components/auth/SignInButton';
import { cn } from '@/lib/utils';
import { SydLogo } from '@/components/branding/SydLogo';

export function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { name: 'Servizi', href: '#services' },
        { name: 'Progetti', href: '#portfolio' },
        { name: 'Chi Siamo', href: '#about' },
        { name: 'FAQ', href: '#faq' },
    ];

    return (
        <>
            <motion.nav
                className={cn(
                    'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent',
                    isScrolled
                        ? 'bg-luxury-bg/80 backdrop-blur-md border-luxury-gold/10 py-3 shadow-lg shadow-black/20'
                        : 'bg-transparent py-5'
                )}
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="group">
                            <SydLogo className="group-hover:opacity-90 transition-opacity" />
                        </Link>
                        <div className="hidden lg:flex items-center gap-2">
                            <a href="tel:+393755463599" className="group" aria-label="Chiama ora">
                                <span className="w-10 h-10 rounded-full bg-luxury-teal/10 flex items-center justify-center border border-luxury-teal/20 text-luxury-teal hover:bg-luxury-teal hover:text-white transition-all shadow-sm shadow-luxury-teal/10">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                    </svg>
                                </span>
                            </a>
                            {[
                                { Icon: Mail, label: 'Email' },
                                {
                                    Icon: ({ className }: { className?: string }) => (
                                        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                        </svg>
                                    ),
                                    label: 'WhatsApp'
                                }
                            ].map(({ Icon, label }, i) => (
                                <a
                                    key={i}
                                    href="#"
                                    className="w-10 h-10 rounded-full bg-luxury-teal/10 flex items-center justify-center text-luxury-teal border border-luxury-teal/20 hover:bg-luxury-teal hover:text-white transition-all shadow-sm shadow-luxury-teal/10"
                                    aria-label={label}
                                >
                                    <Icon className="w-5 h-5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-4">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                href={link.href}
                                className="text-sm font-medium text-luxury-text hover:text-luxury-gold transition-colors relative group"
                            >
                                {link.name}
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-luxury-gold transition-all group-hover:w-full" />
                            </Link>
                        ))}
                        <div className="flex items-center gap-4">
                            <Button
                                variant="premium"
                                size="sm"
                                className="bg-luxury-teal hover:bg-luxury-teal/90 text-white border-none shadow-md shadow-luxury-teal/20"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT_WITH_MESSAGE', {
                                        detail: { message: "Vorrei richiedere un preventivo gratuito per la mia ristrutturazione." }
                                    });
                                    window.dispatchEvent(event);
                                }}
                            >
                                Richiedi Preventivo
                            </Button>
                            <Button
                                variant="premium"
                                size="sm"
                                className="bg-luxury-teal hover:bg-luxury-teal/90 text-white border-none shadow-md shadow-luxury-teal/20"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT_WITH_MESSAGE', {
                                        detail: { message: "Ciao SYD! Vorrei creare un rendering fotorealistico." }
                                    });
                                    window.dispatchEvent(event);
                                }}
                            >
                                Crea Rendering
                            </Button>
                        </div>
                        <SignInButton />
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden text-luxury-text hover:text-luxury-gold transition-colors"
                        onClick={() => setMobileMenuOpen(true)}
                    >
                        <Menu />
                    </button>
                </div>
            </motion.nav>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-[60] bg-luxury-bg flex flex-col p-6 md:hidden border-l border-luxury-gold/10"
                    >
                        <div className="flex justify-between items-center mb-10">
                            <span className="text-xl font-bold text-luxury-gold">Menu</span>
                            <button
                                onClick={() => setMobileMenuOpen(false)}
                                className="p-2 bg-black/20 rounded-full text-luxury-text hover:text-white"
                            >
                                <X />
                            </button>
                        </div>

                        <div className="flex flex-col gap-6">
                            {navLinks.map((link, idx) => (
                                <motion.a
                                    key={link.name}
                                    href={link.href}
                                    className="text-2xl font-semibold text-luxury-text hover:text-luxury-gold"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 + idx * 0.1 }}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {link.name}
                                </motion.a>
                            ))}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="mt-8"
                            >
                                <Button className="w-full py-6 text-lg bg-luxury-teal hover:bg-luxury-teal/90 text-white">
                                    Inizia Progetto
                                </Button>
                                <div className="mt-4 flex justify-center">
                                    <SignInButton />
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
