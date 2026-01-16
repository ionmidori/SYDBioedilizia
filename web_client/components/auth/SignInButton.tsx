'use client';

import { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming this exists

export function SignInButton({ className }: { className?: string }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
            setUser(u);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Login failed:", error);
            alert("Login fallito. Riprova.");
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    if (loading) {
        return <Button variant="ghost" size="sm" className={className} disabled>Loading...</Button>;
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
                        {user.displayName?.split(' ')[0]}
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
        <Button
            onClick={handleLogin}
            variant="outline"
            size="sm"
            className={cn("gap-2 border-slate-700 hover:bg-slate-800", className)}
        >
            <LogIn className="w-4 h-4" />
            Accedi
        </Button>
    );
}
