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
        return <Button variant="ghost" size="sm" className={className} disabled>Caricamento...</Button>;
    }

    // Don't show anything for anonymous users (they're already "logged in" technically)
    // we normally show the login button for anonymous users to allow them to "upgrade"
    // checking isAnonymous === true means they haven't signed in with social/email yet.
    if (user?.isAnonymous) {
        return (
            <>
                <Button
                    onClick={handleLoginClick}
                    variant="secondary"
                    size="sm"
                    className={cn("gap-2 border-accent text-accent-ink hover:bg-accent hover:text-on-accent transition-colors", className)}
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
            <div className={cn("flex items-center p-2 rounded-[1.25rem] glass border border-line transition-all duration-300 shadow-xl group", className)}>
                <Link
                    href="/dashboard/profile"
                    className="flex items-center gap-3 flex-1 px-1 active:scale-95 transition-transform"
                    onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.vibrate) {
                            navigator.vibrate(10);
                        }
                    }}
                >
                    {user.photoURL ? (
                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-line group-hover:border-line transition-colors shadow-sm shrink-0">
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "Profilo utente"}
                                fill
                                sizes="32px"
                                className="object-cover"
                            />
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-accent-subtle flex items-center justify-center border border-line group-hover:bg-accent-subtle transition-all shadow-sm shrink-0">
                            <UserIcon className="w-4 h-4 text-accent-ink" />
                        </div>
                    )}
                    <div className="flex flex-col items-start leading-tight min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink group-hover:text-accent-ink transition-colors truncate w-full text-left">
                            {user.displayName?.split(' ')[0] || "Profilo"}
                        </span>
                        <span className="text-[11px] font-normal uppercase tracking-wider text-ink-subtle group-hover:text-accent-ink transition-colors">
                            Account
                        </span>
                    </div>
                </Link>
                <div className="pl-2 border-l border-line shrink-0 ml-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogout}
                        title="Esci dall'account"
                        aria-label="Esci dall'account"
                        className="text-danger-ink hover:text-danger-ink hover:bg-danger-subtle rounded-full w-8 h-8"
                    >
                        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <>
            <Button
                onClick={handleLoginClick}
                variant="secondary"
                size="sm"
                className={cn("gap-2 border-accent text-accent-ink hover:bg-accent hover:text-on-accent transition-colors", className)}
            >
                <LogIn className="w-4 h-4" />
                Accedi
            </Button>
            {!onLoginClick && <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
        </>
    );
}
