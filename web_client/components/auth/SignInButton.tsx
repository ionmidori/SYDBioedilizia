'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { AuthDialog } from './AuthDialog';

export interface SignInButtonProps {
    className?: string;
    onLoginClick?: () => void;
}

import Link from 'next/link';

export function SignInButton({ className, onLoginClick }: SignInButtonProps) {
    const { user, loading, logout } = useAuth();
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    const handleLoginClick = () => {
        if (onLoginClick) {
            onLoginClick();
        } else {
            setDialogOpen(true);
        }
    };

    if (loading) {
        return <Button variant="ghost" size="sm" className={className} disabled>Loading...</Button>;
    }

    // Don't show anything for anonymous users (they're already "logged in" technically)
    // we normally show the login button for anonymous users to allow them to "upgrade"
    // checking isAnonymous === true means they haven't signed in with social/email yet.
    if (user?.isAnonymous) {
        return (
            <>
                <Button
                    onClick={handleLoginClick}
                    variant="outline"
                    size="sm"
                    className={cn("gap-2 border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold hover:text-luxury-bg transition-colors", className)}
                >
                    <LogIn className="w-4 h-4" />
                    Accedi
                </Button>
                {!onLoginClick && <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
            </>
        );
    }

    if (user) {
        return (
            <div className={cn("flex items-center gap-3", className)}>
                <Link 
                    href="/dashboard/profile" 
                    className="flex items-center gap-3 p-1.5 pr-4 rounded-full glass-premium border border-luxury-gold/20 hover:border-luxury-gold/50 transition-all duration-300 group active:scale-95"
                    onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.vibrate) {
                            navigator.vibrate(10);
                        }
                    }}
                >
                    {user.photoURL ? (
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-luxury-gold/10 group-hover:border-luxury-gold/30 transition-colors shadow-sm">
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "User"}
                                fill
                                sizes="32px"
                                className="object-cover"
                            />
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-luxury-gold/10 flex items-center justify-center border border-luxury-gold/20 group-hover:bg-luxury-gold/20 transition-all shadow-sm">
                            <UserIcon className="w-4 h-4 text-luxury-gold" />
                        </div>
                    )}
                    <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-luxury-text group-hover:text-luxury-gold transition-colors">
                            {user.displayName?.split(' ')[0] || "Profilo"}
                        </span>
                        <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-luxury-text/40 group-hover:text-luxury-gold/60 transition-colors mt-0.5">
                            Account
                        </span>
                    </div>
                </Link>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    title="Logout"
                    className="text-luxury-text/40 hover:text-red-400 hover:bg-red-500/10 rounded-full w-8 h-8"
                >
                    <LogOut className="w-3.5 h-3.5" />
                </Button>
            </div>
        );
    }

    return (
        <>
            <Button
                onClick={handleLoginClick}
                variant="outline"
                size="sm"
                className={cn("gap-2 border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold hover:text-luxury-bg transition-colors", className)}
            >
                <LogIn className="w-4 h-4" />
                Accedi
            </Button>
            {!onLoginClick && <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
        </>
    );
}
