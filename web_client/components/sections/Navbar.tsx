'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@/components/auth/SignInButton';
import { cn } from '@/lib/utils';

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
                        ? 'bg-slate-950/80 backdrop-blur-md border-slate-800 py-3'
                        : 'bg-transparent py-5'
                )}
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative h-16 w-64">
                            <Image
                                src="/syd-logo-v3.png"
                                alt="SYD BIOEDILIZIA"
                                fill
                                className="object-contain object-left"
                                priority
                            />
                        </div>
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-8">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                href={link.href}
                                className="text-sm font-medium text-slate-300 hover:text-white transition-colors relative group"
                            >
                                {link.name}
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-500 transition-all group-hover:w-full" />
                            </Link>
                        ))}
                        <Button variant="premium" size="sm">
                            Richiedi Preventivo
                        </Button>
                        <SignInButton />
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden text-slate-300 hover:text-white"
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
                        className="fixed inset-0 z-[60] bg-slate-950 flex flex-col p-6 md:hidden"
                    >
                        <div className="flex justify-between items-center mb-10">
                            <span className="text-xl font-bold text-white">Menu</span>
                            <button
                                onClick={() => setMobileMenuOpen(false)}
                                className="p-2 bg-slate-900 rounded-full text-slate-400 hover:text-white"
                            >
                                <X />
                            </button>
                        </div>

                        <div className="flex flex-col gap-6">
                            {navLinks.map((link, idx) => (
                                <motion.a
                                    key={link.name}
                                    href={link.href}
                                    className="text-2xl font-semibold text-slate-300 hover:text-white"
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
                                <Button variant="premium" className="w-full py-6 text-lg">
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
