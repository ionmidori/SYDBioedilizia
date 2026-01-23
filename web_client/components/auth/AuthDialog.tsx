'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProviderButton } from './ProviderButton';
import { EmailAuthForm } from './EmailAuthForm';
import { MagicLinkForm } from './MagicLinkForm';
import { PasskeyButton } from './PasskeyButton';
import { useAuth } from '@/hooks/useAuth';

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
    const { loginWithGoogle, loginWithApple } = useAuth();
    const [loading, setLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'social' | 'magic' | 'email'>('social');

    const handleGoogleSignIn = async () => {
        if (loading) return;
        setLoading('google');

        try {
            await loginWithGoogle();
            onOpenChange(false);
        } catch (error: any) {
            console.error('Google sign-in error:', error);
            if (error.code !== 'auth/popup-closed-by-user') {
                alert('Errore durante il login con Google. Riprova.');
            }
        } finally {
            setLoading(null);
        }
    };

    const handleAppleSignIn = async () => {
        if (loading) return;
        setLoading('apple');

        try {
            await loginWithApple();
            onOpenChange(false);
        } catch (error: any) {
            console.error('Apple sign-in error:', error);
            if (error.code !== 'auth/popup-closed-by-user') {
                alert('Errore durante il login con Apple. Riprova.');
            }
        } finally {
            setLoading(null);
        }
    };

    const handleEmailSuccess = () => {
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-white text-center">
                        Benvenuto in SYD
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-center">
                        Accedi per salvare le tue conversazioni e accedere a tutte le funzionalità
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'social' | 'magic' | 'email')} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3 bg-slate-800/50">
                        <TabsTrigger value="social" className="data-[state=active]:bg-slate-700">
                            Social
                        </TabsTrigger>
                        <TabsTrigger value="magic" className="data-[state=active]:bg-slate-700">
                            Magic Link
                        </TabsTrigger>
                        <TabsTrigger value="email" className="data-[state=active]:bg-slate-700">
                            Email
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="social" className="space-y-3 mt-6">
                        {/* Passkey (Biometric) Button - Premium Option */}
                        <PasskeyButton mode="login" onSuccess={handleEmailSuccess} />

                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-700"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-slate-900 px-2 text-slate-500">Oppure</span>
                            </div>
                        </div>

                        <ProviderButton
                            provider="google"
                            onClick={handleGoogleSignIn}
                            loading={loading === 'google'}
                            disabled={loading !== null}
                        />
                        <ProviderButton
                            provider="apple"
                            onClick={handleAppleSignIn}
                            loading={loading === 'apple'}
                            disabled={loading !== null}
                        />

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-700"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-slate-900 px-2 text-slate-500">Oppure</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setActiveTab('email')}
                            className="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            Usa Email e Password →
                        </button>
                    </TabsContent>

                    <TabsContent value="magic" className="mt-6">
                        <MagicLinkForm onSuccess={handleEmailSuccess} />
                    </TabsContent>

                    <TabsContent value="email" className="mt-6">
                        <EmailAuthForm onSuccess={handleEmailSuccess} />
                    </TabsContent>
                </Tabs>

                <p className="text-xs text-slate-500 text-center mt-6">
                    🔒 Le tue credenziali sono crittografate e sicure
                </p>
            </DialogContent>
        </Dialog>
    );
}
