'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { M3Spring, M3Transition, createStaggerVariants } from '@/lib/m3-motion';
import { Menu, Mail } from 'lucide-react';
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
    const { container: mobileMenuContainer, item: mobileMenuItem } = createStaggerVariants({ x: 20 }, 0.05);
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [contactMenuOpen, setContactMenuOpen] = useState(false);
    const [contactMenuOpenDesktop, setContactMenuOpenDesktop] = useState(false);
    const contactMenuRef = useRef<HTMLDivElement>(null);
    const contactMenuRefDesktop = useRef<HTMLDivElement>(null);
    const { user, isAnonymous } = useAuth();
    const router = useRouter();

    const isAuthenticated = user && !isAnonymous;

    // Close contact menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (contactMenuOpen && contactMenuRef.current && !contactMenuRef.current.contains(event.target as Node)) {
                setContactMenuOpen(false);
            }
            if (contactMenuOpenDesktop && contactMenuRefDesktop.current && !contactMenuRefDesktop.current.contains(event.target as Node)) {
                setContactMenuOpenDesktop(false);
            }
        };

        if (contactMenuOpen || contactMenuOpenDesktop) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [contactMenuOpen, contactMenuOpenDesktop]);

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
                    'fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b border-transparent',
                    isScrolled
                        ? 'bg-luxury-gold/10 backdrop-blur-xl border-luxury-gold/20 py-3 shadow-elevation-mid'
                        : 'bg-transparent py-5'
                )}
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={M3Spring.gentle}
            >
                <div className="container mx-auto px-4 md:px-6 flex items-center justify-between relative">
                    {/* Left: Logo & Contacts */}
                    <div className="flex items-center gap-4 xl:gap-8 z-10 shrink-0">
                        <Link href="/" onClick={() => triggerHaptic()} className="group shrink-0">
                            <SydLogo className="group-hover:opacity-90 transition-opacity" />
                        </Link>
                        {/* Desktop Contact Dropdown - M3 Expressive */}
                        <div className="hidden xl:flex items-center gap-2 relative" ref={contactMenuRefDesktop}>
                            <motion.div
                                whileTap={{ scale: 0.95 }}
                                transition={M3Transition.buttonPress}
                            >
                                <button
                                    className={cn(
                                        "relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 group shadow-[0_4px_15px_-3px_rgba(233,196,106,0.1)] hover:shadow-[0_4px_20px_-3px_rgba(233,196,106,0.25)] whitespace-nowrap backdrop-blur-md border",
                                        contactMenuOpenDesktop
                                            ? "bg-luxury-gold/15 border-luxury-gold/40 text-luxury-gold"
                                            : "bg-luxury-gold/5 hover:bg-luxury-gold/15 border-luxury-gold/20 hover:border-luxury-gold/40 text-luxury-gold/80 hover:text-luxury-gold"
                                    )}
                                    onClick={() => {
                                        triggerHaptic();
                                        setContactMenuOpenDesktop(!contactMenuOpenDesktop);
                                    }}
                                    aria-expanded={contactMenuOpenDesktop}
                                    aria-haspopup="true"
                                >
                                    <span className="font-bold tracking-[0.05em] text-[11px] xl:text-[12px] uppercase">Contatti</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("w-4 h-4 transition-transform duration-300", contactMenuOpenDesktop && "rotate-180")}>
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                            </motion.div>
                            
                            <AnimatePresence>
                                {contactMenuOpenDesktop && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        transition={M3Spring.bouncy}
                                        className="absolute top-14 left-0 bg-luxury-bg/95 backdrop-blur-xl border border-luxury-gold/20 shadow-elevation-high p-2 flex flex-col gap-1 min-w-[220px] rounded-[4px_24px_24px_24px] origin-top-left z-50"
                                    >
                                        <div className="absolute -top-2 left-6 w-4 h-4 bg-luxury-bg/95 border-t border-l border-luxury-gold/20 rotate-45 transform" />

                                        {contactLinks.map(({ Icon, label, href }, i) => (
                                            <motion.a
                                                key={i}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded-[16px] hover:bg-luxury-gold/10 text-luxury-text hover:text-luxury-gold transition-colors group relative z-10"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setContactMenuOpenDesktop(false);
                                                }}
                                                whileHover={{ x: 4 }}
                                                whileTap={{ scale: 0.98 }}
                                                transition={M3Spring.gentle}
                                            >
                                                <span className="w-8 h-8 rounded-full bg-luxury-gold/10 flex items-center justify-center text-luxury-gold border border-luxury-gold/20 group-hover:bg-luxury-gold group-hover:text-luxury-bg transition-all shadow-sm">
                                                    <Icon className="w-4 h-4" />
                                                </span>
                                                <span className="font-medium text-sm tracking-wide">{label}</span>
                                            </motion.a>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Desktop Nav - Central Group */}
                    <div className="hidden xl:flex flex-1 justify-end items-center gap-2 xl:gap-4 z-10 px-4 xl:px-8 min-w-0">
                        {navLinks.map((link) => (
                            <motion.div
                                key={link.name}
                                whileTap={{ scale: 0.95 }}
                                transition={M3Transition.buttonPress}
                                className="shrink-0"
                            >
                                <Link
                                    href={link.href}
                                    onClick={() => triggerHaptic()}
                                    className={cn(
                                        "relative flex items-center justify-center px-4 py-2 rounded-xl transition-all duration-300 group shadow-[0_4px_15px_-3px_rgba(233,196,106,0.1)] hover:shadow-[0_4px_20px_-3px_rgba(233,196,106,0.25)] whitespace-nowrap backdrop-blur-md border",
                                        pathname === link.href
                                            ? "bg-luxury-gold/15 border-luxury-gold/40 text-luxury-gold"
                                            : "bg-luxury-gold/5 hover:bg-luxury-gold/15 border-luxury-gold/20 hover:border-luxury-gold/40 text-luxury-gold/80 hover:text-luxury-gold"
                                    )}
                                >
                                    <span className="font-bold tracking-[0.05em] text-[11px] xl:text-[12px] uppercase">{link.name}</span>
                                </Link>
                            </motion.div>
                        ))}
                    </div>

                    {/* Right: Auth Only */}
                    <div className="hidden xl:flex items-center gap-3 z-10 shrink-0">
                        <SignInButton onLoginClick={() => {
                            triggerHaptic();
                            window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', {
                                detail: { redirectOnLogin: true }
                            }));
                        }} />
                    </div>

                    {/* Mobile Actions */}
                    <div className="flex items-center gap-2 xl:hidden z-10 shrink-0">
                        {/* Contact Dropdown Trigger */}
                        <div className="relative" ref={contactMenuRef}>
                            <button
                                className={cn(
                                    "p-2 rounded-full text-luxury-text hover:text-luxury-gold transition-colors",
                                    contactMenuOpen && "text-luxury-gold bg-luxury-gold/10"
                                )}
                                onClick={() => {
                                    triggerHaptic();
                                    setContactMenuOpen(!contactMenuOpen);
                                }}
                                aria-label="Contatti"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 md:w-6 md:h-6">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                            </button>

                            {/* Contact Menù Dropdown - M3 Expressive */}
                            <AnimatePresence>
                                {contactMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        transition={M3Spring.bouncy}
                                        className="absolute top-12 right-0 bg-luxury-bg/95 backdrop-blur-xl border border-luxury-gold/20 shadow-elevation-high p-2 flex flex-col gap-1 min-w-[200px] rounded-[24px_4px_24px_24px] origin-top-right z-50"
                                    >
                                        <div className="absolute -top-2 right-3 w-4 h-4 bg-luxury-bg/95 border-t border-l border-luxury-gold/20 rotate-45 transform" />

                                        {contactLinks.map(({ Icon, label, href }, i) => (
                                            <motion.a
                                                key={i}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded-[16px] hover:bg-luxury-gold/10 text-luxury-text hover:text-luxury-gold transition-colors group relative z-10"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setContactMenuOpen(false);
                                                }}
                                                whileHover={{ x: -4 }}
                                                whileTap={{ scale: 0.98 }}
                                                transition={M3Spring.gentle}
                                            >
                                                <span className="w-8 h-8 rounded-full bg-luxury-gold/10 flex items-center justify-center text-luxury-gold border border-luxury-gold/20 group-hover:bg-luxury-gold group-hover:text-luxury-bg transition-all shadow-sm">
                                                    <Icon className="w-4 h-4" />
                                                </span>
                                                <span className="font-medium text-sm tracking-wide">{label}</span>
                                            </motion.a>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Hamburger Menu Trigger using Sheet */}
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} modal={false}>
                            <SheetTrigger asChild>
                                <button
                                    className="p-2 rounded-full text-luxury-text hover:text-luxury-gold transition-colors"
                                    onClick={() => {
                                        triggerHaptic();
                                        setContactMenuOpen(false);
                                    }}
                                    aria-label="Menu"
                                    suppressHydrationWarning
                                >
                                    <Menu className="w-5 h-5 md:w-6 md:h-6" />
                                </button>
                            </SheetTrigger>
                            <SheetContent
                                side="right"
                                hideOverlay={true}
                                className="w-[45vw] sm:w-[33vw] min-w-[180px] max-w-[260px] bg-luxury-bg/10 backdrop-blur-xl border-l border-luxury-gold/10 p-4 flex flex-col"
                            >
                                <SheetHeader className="mt-6 mb-6 text-center space-y-0">
                                    <SheetTitle className="text-[16px] font-bold uppercase tracking-[0.3em] text-luxury-gold/60">
                                        Menu
                                    </SheetTitle>
                                    <SheetDescription className="sr-only">
                                        Navigazione principale del sito e link ai contatti.
                                    </SheetDescription>
                                </SheetHeader>

                                {/* Navigation Links */}
                                <motion.div
                                    className="flex flex-col gap-2 w-full"
                                    variants={mobileMenuContainer}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    {/* Area Personale */}
                                    <motion.div variants={mobileMenuItem} className="w-full">
                                        <button
                                            onClick={handlePersonalAreaClick}
                                            className="flex items-center justify-center w-full p-3 rounded-[1.25rem] glass-premium border-luxury-gold/10 transition-all duration-300 hover:border-luxury-gold/30 hover:bg-white/5 active:scale-95 group shadow-xl"
                                        >
                                            <span className="font-bold uppercase tracking-[0.15em] text-[10px] text-luxury-text group-hover:text-luxury-gold transition-colors">Area Personale</span>
                                        </button>
                                    </motion.div>

                                    {navLinks.map((link) => (
                                        <motion.div
                                            key={link.name}
                                            variants={mobileMenuItem}
                                            className="w-full"
                                        >
                                            <Link
                                                href={link.href}
                                                className="flex items-center justify-center w-full p-3 rounded-[1.25rem] glass-premium border-luxury-gold/10 transition-all duration-300 hover:border-luxury-gold/30 hover:bg-white/5 active:scale-95 group shadow-xl"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setMobileMenuOpen(false);
                                                }}
                                            >
                                                <span className="font-bold uppercase tracking-[0.1em] text-[10px] text-luxury-text hover:text-luxury-gold transition-colors">{link.name}</span>
                                            </Link>
                                        </motion.div>
                                    ))}

                                    {/* Spacer and Sign In/Profile Button below FAQ */}
                                    <motion.div variants={mobileMenuItem} className="flex flex-col w-full">
                                        <div className="h-[44px] w-full" aria-hidden="true" />
                                        <div className="w-full flex justify-center">
                                            <SignInButton
                                                className="w-full justify-between"
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
                                        </div>
                                    </motion.div>
                                </motion.div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </motion.nav>
        </>
    );
}

