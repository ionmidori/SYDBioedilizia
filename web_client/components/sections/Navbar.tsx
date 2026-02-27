'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { M3Spring, M3Duration } from '@/lib/m3-motion';
import { Menu, Mail, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@/components/auth/SignInButton';
import { cn } from '@/lib/utils';
import { SydLogo } from '@/components/branding/SydLogo';
import { useAuth } from '@/hooks/useAuth';
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle,
    SheetHeader,
    SheetDescription,
} from "@/components/ui/sheet";

/**
 * Trigger a short haptic feedback on supported mobile devices
 */
const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
    }
};

export function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [contactMenuOpen, setContactMenuOpen] = useState(false);
    const contactMenuRef = useRef<HTMLDivElement>(null);
    const { user, isAnonymous } = useAuth();
    const router = useRouter();

    const isAuthenticated = user && !isAnonymous;

    // Close contact menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (contactMenuOpen && contactMenuRef.current && !contactMenuRef.current.contains(event.target as Node)) {
                setContactMenuOpen(false);
            }
        };

        if (contactMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [contactMenuOpen]);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const pathname = usePathname();

    const navLinks = [
        { name: 'Servizi', href: pathname === '/' ? '#services' : '/#services' },
        { name: 'Progetti', href: pathname === '/' ? '#portfolio' : '/#portfolio' },
        { name: 'Blog', href: '/blog' },
        { name: 'Chi Siamo', href: '/chi-siamo' },
        { name: 'FAQ', href: '/faq' },
    ];

    const contactLinks = [
        {
            Icon: ({ className }: { className?: string }) => (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
            ),
            label: 'Chiama',
            href: 'tel:+393755463599'
        },
        { Icon: Mail, label: 'Email', href: 'mailto:sydbioedilizia@gmail.com' },
        {
            Icon: ({ className }: { className?: string }) => (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
            ),
            label: 'WhatsApp',
            href: 'https://wa.me/393755463599'
        }
    ];

    const handlePersonalAreaClick = (e: React.MouseEvent) => {
        e.preventDefault();
        triggerHaptic();
        setMobileMenuOpen(false);

        if (isAuthenticated) {
            router.push('/dashboard');
        } else {
            // Delay to allow mobile menu Sheet to close and restore focus properly
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', {
                    detail: { redirectOnLogin: true }
                }));
            }, 300);
        }
    };

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
                transition={M3Spring.gentle}
            >
                <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="group">
                            <SydLogo className="group-hover:opacity-90 transition-opacity" />
                        </Link>
                        {/* Desktop Contact Icons */}
                        <div className="hidden lg:flex items-center gap-2">
                            {contactLinks.map(({ Icon, label, href }, i) => (
                                <a
                                    key={i}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        "w-10 h-10 rounded-full bg-luxury-teal/10 flex items-center justify-center text-luxury-teal border border-luxury-teal/20 hover:bg-luxury-teal hover:text-white transition-all shadow-sm shadow-luxury-teal/10",
                                        i === 0 && "group"
                                    )}
                                    aria-label={label}
                                >
                                    <Icon className="w-5 h-5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-4">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="premium"
                                size="sm"
                                className="bg-luxury-teal hover:bg-luxury-teal/90 text-white border-none shadow-md shadow-luxury-teal/20"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT');
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
                                    const event = new CustomEvent('OPEN_CHAT');
                                    window.dispatchEvent(event);
                                }}
                            >
                                Crea Rendering
                            </Button>
                        </div>
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
                        <SignInButton onLoginClick={() => {
                            window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', {
                                detail: { redirectOnLogin: true }
                            }));
                        }} />
                    </div>

                    {/* Mobile Actions */}
                    <div className="flex items-center gap-2 md:hidden">
                        {/* Contact Dropdown Trigger */}
                        <div className="relative">
                            <Sheet open={contactMenuOpen} onOpenChange={setContactMenuOpen}>
                                <SheetTrigger asChild>
                                    <button
                                        className={cn(
                                            "p-2 rounded-full text-luxury-text hover:text-luxury-gold transition-colors",
                                            contactMenuOpen && "text-luxury-gold bg-luxury-gold/10"
                                        )}
                                        onClick={() => triggerHaptic()}
                                        aria-label="Contatti"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                        </svg>
                                    </button>
                                </SheetTrigger>
                                <SheetContent
                                    side="bottom"
                                    className="bg-luxury-bg/95 backdrop-blur-xl border-t border-luxury-gold/10 p-6 rounded-t-[2rem] sm:max-w-none"
                                >
                                    <SheetHeader className="mb-6 text-left">
                                        <SheetTitle className="text-xs font-bold uppercase tracking-[0.3em] text-luxury-gold/60">
                                            Contatti Rapidi
                                        </SheetTitle>
                                        <SheetDescription className="text-luxury-text/60 text-sm">
                                            Scegli come preferisci metterti in contatto con noi.
                                        </SheetDescription>
                                    </SheetHeader>
                                    <div className="flex flex-col gap-3">
                                        {contactLinks.map(({ Icon, label, href }, i) => (
                                            <motion.a
                                                key={i}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.05, ...M3Spring.standard }}
                                                className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-luxury-text hover:bg-luxury-gold/10 hover:border-luxury-gold/30 hover:text-luxury-gold transition-all group"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setContactMenuOpen(false);
                                                }}
                                            >
                                                <span className="w-10 h-10 rounded-full bg-luxury-teal/10 flex items-center justify-center text-luxury-teal border border-luxury-teal/20 group-hover:bg-luxury-teal group-hover:text-white transition-all">
                                                    <Icon className="w-5 h-5" />
                                                </span>
                                                <span className="font-bold uppercase tracking-[0.1em] text-xs font-serif">{label}</span>
                                            </motion.a>
                                        ))}
                                    </div>
                                    <div className="mt-8 flex justify-center">
                                        <button
                                            onClick={() => setContactMenuOpen(false)}
                                            className="text-xs font-bold uppercase tracking-widest text-luxury-text/30 hover:text-luxury-text/60 transition-colors"
                                        >
                                            Chiudi
                                        </button>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>

                        {/* Hamburger Menu Trigger using Sheet */}
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <button
                                    className="p-2 rounded-full text-luxury-text hover:text-luxury-gold transition-colors"
                                    onClick={() => {
                                        triggerHaptic();
                                        setContactMenuOpen(false);
                                    }}
                                    aria-label="Menu"
                                >
                                    <Menu className="w-6 h-6" />
                                </button>
                            </SheetTrigger>
                            <SheetContent
                                side="right"
                                className="w-auto min-w-[260px] bg-luxury-bg/90 backdrop-blur-xl border-l border-luxury-gold/10 p-6 flex flex-col sm:max-w-none"
                            >
                                <SheetHeader className="mb-10 text-left space-y-0">
                                    <SheetTitle className="text-xs font-bold uppercase tracking-[0.3em] text-luxury-gold/60">
                                        Menu
                                    </SheetTitle>
                                    <SheetDescription className="sr-only">
                                        Navigazione principale del sito e link ai contatti.
                                    </SheetDescription>
                                </SheetHeader>

                                {/* Navigation Links */}
                                <div className="flex flex-col gap-3">
                                    {/* Area Personale */}
                                    <motion.div
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.1, ...M3Spring.standard }}
                                    >
                                        <button
                                            onClick={handlePersonalAreaClick}
                                            className="flex items-center justify-center px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-luxury-text/80 hover:bg-luxury-gold/10 hover:border-luxury-gold/30 hover:text-luxury-gold transition-all duration-300 active:scale-95 group w-full"
                                        >
                                            <span className="font-bold uppercase tracking-[0.2em] text-[10px]">Area Personale</span>
                                        </button>
                                    </motion.div>

                                    {navLinks.map((link, idx) => (
                                        <motion.div
                                            key={link.name}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.15 + idx * 0.05, ...M3Spring.standard }}
                                        >
                                            <Link
                                                href={link.href}
                                                className="flex items-center justify-center px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-luxury-text/80 hover:bg-luxury-gold/10 hover:border-luxury-gold/30 hover:text-luxury-gold transition-all duration-300 active:scale-95 group w-full"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setMobileMenuOpen(false);
                                                }}
                                            >
                                                <span className="font-bold uppercase tracking-[0.2em] text-[10px]">{link.name}</span>
                                            </Link>
                                        </motion.div>
                                    ))}
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4, ...M3Spring.gentle }}
                                    className="mt-auto pt-8 flex justify-center"
                                >
                                    <SignInButton
                                        onLoginClick={() => {
                                            triggerHaptic();
                                            setMobileMenuOpen(false);
                                            setTimeout(() => {
                                                window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', {
                                                    detail: { redirectOnLogin: true }
                                                }));
                                            }, 300);
                                        }}
                                    />
                                </motion.div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </motion.nav>
        </>
    );
}
