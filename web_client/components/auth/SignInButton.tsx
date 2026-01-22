'use client';

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { AuthDialog } from './AuthDialog';

export function SignInButton({ className }: { className?: string }) {
    const { user, loading } = useAuth();
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await signOut((await import('@/lib/firebase')).auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    if (loading) {
        return <Button variant="ghost" size="sm" className={className} disabled>Loading...</Button>;
    }

    // Don't show anything for anonymous users (they're already "logged in" technically)
    if (user?.isAnonymous) {
        return (
            <>
                <Button
                    onClick={() => setDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    className={cn("gap-2 border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold hover:text-luxury-bg transition-colors", className)}
                >
                    <LogIn className="w-4 h-4" />
                    Accedi
                </Button>
                <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            </>
        );
    }

    if (user) {
        return (
            <div className={cn("flex items-center gap-3", className)}>
                <div className="flex items-center gap-2">
                    {user.photoURL ? (
                        <img
                            src={user.photoURL}
                            alt={user.displayName || "User"}
                            className="w-8 h-8 rounded-full border border-slate-700"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                            <UserIcon className="w-4 h-4 text-slate-400" />
                        </div>
                    )}
                    <span className="text-sm font-medium text-slate-300 hidden lg:block">
                        {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    title="Logout"
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                >
                    <LogOut className="w-4 h-4" />
                </Button>
            </div>
        );
    }

    return (
        <>
            <Button
                onClick={() => setDialogOpen(true)}
                variant="outline"
                size="sm"
                className={cn("gap-2 border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold hover:text-luxury-bg transition-colors", className)}
            >
                <LogIn className="w-4 h-4" />
                Accedi
            </Button>
            <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
    );
}
