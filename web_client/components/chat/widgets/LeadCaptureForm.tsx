"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Lock, FileText, User, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LeadCaptureFormProps {
    quoteSummary: string;
    onSuccess?: (data: any) => void;
}

export const LeadCaptureForm: React.FC<LeadCaptureFormProps> = ({ quoteSummary, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: ''
    });
    const [isAgreed, setIsAgreed] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
    const [error, setError] = useState<string | null>(null);

    const validateEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!validateEmail(formData.email)) {
            setError("Inserisci un'email valida.");
            return;
        }

        setStatus('loading');

        try {
            // Simulate API delay for UX (or call real API)
            // Real implementation would POST to /api/tools/submit_lead here or pass back to chat
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Here we would perform the actual submission.
            // For now, we simulate success and let the parent handle the data flow
            setStatus('success');
            if (onSuccess) onSuccess(formData);

        } catch (err) {
            setError("Si è verificato un errore. Riprova.");
            setStatus('idle');
        }
    };

    if (status === 'success') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 backdrop-blur-md text-center"
            >
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-white font-medium text-lg mb-2">Dati Ricevuti!</h3>
                <p className="text-slate-300 text-sm">
                    Stiamo elaborando il tuo preventivo per "{quoteSummary}".
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md mx-auto p-1 rounded-3xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 shadow-2xl backdrop-blur-xl"
        >
            <div className="bg-luxury-bg/95 rounded-[22px] p-6 relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-luxury-gold/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                <div className="relative z-10">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                        <div className="p-2 bg-luxury-teal/10 rounded-lg">
                            <FileText className="w-5 h-5 text-luxury-teal" />
                        </div>
                        <div>
                            <h3 className="text-white font-medium text-sm text-balance">
                                Richiesta Preventivo
                            </h3>
                            <p className="text-xs text-slate-400 truncate max-w-[200px]">
                                {quoteSummary}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-xs font-medium text-slate-400 ml-1">
                                Nome Completo
                            </Label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                <Input
                                    id="name"
                                    placeholder="Mario Rossi"
                                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-luxury-gold/50 transition-colors"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs font-medium text-slate-400 ml-1">
                                Email
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="mario@example.com"
                                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-luxury-gold/50 transition-colors"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-xs font-medium text-slate-400 ml-1">
                                Telefono
                            </Label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="+39 333 ..."
                                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-luxury-gold/50 transition-colors"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>

                        {/* GDPR Checkbox */}
                        <div className="pt-2">
                            <label className="flex items-start gap-3 cursor-pointer group">
                                <div className="relative mt-0.5">
                                    <input
                                        type="checkbox"
                                        className="peer sr-only"
                                        checked={isAgreed}
                                        onChange={(e) => setIsAgreed(e.target.checked)}
                                    />
                                    <div className="w-5 h-5 border border-slate-600 rounded flex items-center justify-center transition-colors peer-checked:bg-luxury-teal peer-checked:border-luxury-teal group-hover:border-luxury-gold/50">
                                        <Check className="w-3.5 h-3.5 text-black opacity-0 peer-checked:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                                <div className="text-xs text-slate-400 leading-relaxed">
                                    Ho letto l'informativa e acconsento al trattamento dei dati personali per la gestione della richiesta. <a href="#" className="text-luxury-teal hover:underline underline-offset-2">Privacy Policy</a>
                                </div>
                            </label>
                        </div>

                        {error && (
                            <div className="text-red-400 text-xs px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={!isAgreed || status === 'loading'}
                            className="w-full bg-luxury-gold hover:bg-luxury-gold/90 text-black font-semibold h-11 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'loading' ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Lock className="w-4 h-4 mr-2" />
                            )}
                            {status === 'loading' ? 'Invio in corso...' : 'Invia Dati in Sicurezza'}
                        </Button>

                        <div className="text-[10px] text-center text-slate-600 flex items-center justify-center gap-1.5">
                            <Lock className="w-3 h-3" />
                            I tuoi dati sono criptati e protetti via SSL a 256-bit.
                        </div>
                    </form>
                </div>
            </div>
        </motion.div>
    );
};
