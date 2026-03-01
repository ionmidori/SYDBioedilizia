'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { M3Spring, M3Transition, createStaggerVariants } from '@/lib/m3-motion';
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
    const { container: mobileMenuContainer, item: mobileMenuItem } = createStaggerVariants({ x: 20 }, 0.05);
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [contactMenuOpen, setContactMenuOpen] = useState(false);
    const [hoveredNavIndex, setHoveredNavIndex] = useState<number | null>(null);
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
                    'fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b border-transparent',
                    isScrolled
                        ? 'glass-premium border-luxury-gold/10 py-3 shadow-elevation-low'
                        : 'bg-transparent py-5'
                )}
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={M3Spring.gentle}
            >
                <div className="container mx-auto px-4 md:px-6 flex items-center justify-between relative">
                    <div className="flex items-center gap-4 xl:gap-6 z-10 shrink-0">
                        <Link href="/" onClick={() => triggerHaptic()} className="group shrink-0">
                            <SydLogo className="group-hover:opacity-90 transition-opacity" />
                        </Link>
                        {/* Desktop Contact Icons */}
                        <div className="hidden xl:flex items-center gap-2">
                            {contactLinks.map(({ Icon, label, href }, i) => (
                                <a
                                    key={i}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => triggerHaptic()}
                                    className={cn(
                                        "w-9 h-9 xl:w-10 xl:h-10 rounded-full bg-luxury-teal/10 flex items-center justify-center text-luxury-teal border border-luxury-teal/20 hover:bg-luxury-teal hover:text-white transition-all shadow-sm shadow-luxury-teal/10",
                                        i === 0 && "group"
                                    )}
                                    aria-label={label}
                                >
                                    <Icon className="w-4 h-4 xl:w-5 xl:h-5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Desktop Nav */}
                    <div className="hidden xl:flex flex-1 justify-center items-center gap-1 z-10 px-2 min-w-0">
                        {navLinks.map((link, idx) => (
                            <motion.div
                                key={link.name}
                                whileTap={{ scale: 0.95 }}
                                transition={M3Transition.buttonPress}
                                className="shrink-0"
                            >
                                <Link
                                    href={link.href}
                                    onMouseEnter={() => setHoveredNavIndex(idx)}
                                    onMouseLeave={() => setHoveredNavIndex(null)}
                                    onClick={() => triggerHaptic()}
                                    className="relative px-2 py-2 xl:px-3 text-[13px] xl:text-sm font-medium text-luxury-text hover:text-luxury-gold transition-colors group whitespace-nowrap"
                                >
                                    {hoveredNavIndex === idx && (
                                        <motion.div
                                            layoutId="nav-pill"
                                            className="absolute inset-0 bg-luxury-gold/10 rounded-full"
                                            transition={M3Spring.gentle}
                                        />
                                    )}
                                    <span className="relative z-10">{link.name}</span>
                                </Link>
                            </motion.div>
                        ))}
                    </div>

                    <div className="hidden xl:flex items-center gap-2 z-10 shrink-0">
                        <div className="flex items-center gap-2">
                            <motion.div whileTap={{ scale: 0.98 }} transition={M3Transition.buttonPress}>
                                <Button
                                    variant="premium"
                                    size="sm"
                                    className="m3-shape-pill bg-luxury-teal hover:bg-luxury-teal/90 text-white border border-white/20 shadow-elevation-low hover:shadow-elevation-high hover:shadow-luxury-teal/30 transition-all duration-300 whitespace-nowrap px-3 text-[13px] h-9"
                                    onClick={() => {
                                        triggerHaptic();
                                        const event = new CustomEvent('OPEN_CHAT');
                                        window.dispatchEvent(event);
                                    }}
                                >
                                    Richiedi Preventivo
                                </Button>
                            </motion.div>
                            <motion.div whileTap={{ scale: 0.98 }} transition={M3Transition.buttonPress}>
                                <Button
                                    variant="premium"
                                    size="sm"
                                    className="m3-shape-pill bg-luxury-teal hover:bg-luxury-teal/90 text-white border border-white/20 shadow-elevation-low hover:shadow-elevation-high hover:shadow-luxury-teal/30 transition-all duration-300 whitespace-nowrap px-3 text-[13px] h-9"
                                    onClick={() => {
                                        triggerHaptic();
                                        const event = new CustomEvent('OPEN_CHAT');
                                        window.dispatchEvent(event);
                                    }}
                                >
                                    Crea Rendering
                                </Button>
                            </motion.div>
                        </div>
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

                            {/* Contact Menù Dropdown */}
                            <AnimatePresence>
                                {contactMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={M3Spring.standard}
                                        className="absolute top-12 right-0 bg-luxury-bg/95 backdrop-blur-xl border border-luxury-gold/10 shadow-xl shadow-black/20 rounded-2xl p-4 flex flex-col gap-2 min-w-[200px]"
                                    >
                                        <div className="absolute -top-2 right-3 w-4 h-4 bg-luxury-bg/95 border-t border-l border-luxury-gold/10 rotate-45 transform" />
                                        
                                        {contactLinks.map(({ Icon, label, href }, i) => (
                                            <a
                                                key={i}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-luxury-gold/5 text-luxury-text hover:text-luxury-gold transition-all group relative z-10"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setContactMenuOpen(false);
                                                }}
                                            >
                                                <span className="w-8 h-8 rounded-full bg-luxury-teal/10 flex items-center justify-center text-luxury-teal border border-luxury-teal/20 group-hover:bg-luxury-teal group-hover:text-white transition-all">
                                                    <Icon className="w-4 h-4" />
                                                </span>
                                                <span className="font-medium text-sm">{label}</span>
                                            </a>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
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
                                    <Menu className="w-5 h-5 md:w-6 md:h-6" />
                                </button>
                            </SheetTrigger>
                            <SheetContent
                                side="right"
                                className="w-[80vw] max-w-[320px] min-w-[240px] bg-luxury-bg/95 backdrop-blur-xl border-l border-luxury-gold/10 p-5 flex flex-col sm:max-w-none"
                            >
                                <SheetHeader className="mb-8 text-left space-y-0">
                                    <SheetTitle className="text-[10px] font-bold uppercase tracking-[0.3em] text-luxury-gold/60">
                                        Menu
                                    </SheetTitle>
                                    <SheetDescription className="sr-only">
                                        Navigazione principale del sito e link ai contatti.
                                    </SheetDescription>
                                </SheetHeader>

                                {/* Navigation Links */}
                                <motion.div 
                                    className="flex flex-col gap-2"
                                    variants={mobileMenuContainer}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    {/* Area Personale */}
                                    <motion.div variants={mobileMenuItem}>
                                        <button
                                            onClick={handlePersonalAreaClick}
                                            className="flex items-center justify-center px-4 py-3 rounded-xl glass-premium border-luxury-gold/20 text-luxury-gold transition-all duration-300 active:scale-95 group w-full shadow-elevation-low shadow-luxury-gold/20 hover:shadow-elevation-high hover:shadow-luxury-gold/40 hover:bg-luxury-gold/10"
                                        >
                                            <span className="font-bold uppercase tracking-[0.2em] text-[10px]">Area Personale</span>
                                        </button>
                                    </motion.div>

                                    {navLinks.map((link) => (
                                        <motion.div
                                            key={link.name}
                                            variants={mobileMenuItem}
                                        >
                                            <Link
                                                href={link.href}
                                                className="flex items-center justify-center px-4 py-3 rounded-xl glass-premium border-luxury-gold/20 text-luxury-text hover:text-luxury-gold transition-all duration-300 active:scale-95 group w-full shadow-elevation-low shadow-luxury-gold/10 hover:shadow-elevation-high hover:shadow-luxury-gold/30 hover:bg-luxury-gold/5"
                                                onClick={() => {
                                                    triggerHaptic();
                                                    setMobileMenuOpen(false);
                                                }}
                                            >
                                                <span className="font-bold uppercase tracking-[0.2em] text-[10px]">{link.name}</span>
                                            </Link>
                                        </motion.div>
                                    ))}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4, ...M3Spring.gentle }}
                                    className="mt-auto pt-6 flex justify-center w-full"
                                >
                                    <div className="w-full scale-90 origin-bottom">
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
                                    </div>
                                </motion.div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </motion.nav>
        </>
    );
}

