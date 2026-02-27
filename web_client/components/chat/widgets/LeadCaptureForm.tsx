'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, User, Mail, Phone, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { leadSchema, type LeadValues } from '@/lib/validation/project-actions-schema';
import { triggerHaptic } from '@/utils/haptics';

interface LeadFormProps {
    onSubmit: (data: any) => void;
    description?: string;
    initialData?: any;
}

export const LeadCaptureForm: React.FC<LeadFormProps> = ({
    onSubmit,
    description = "Per completare la tua richiesta e inviarti il materiale, abbiamo bisogno di un tuo riferimento.",
    initialData = {}
}) => {
    const [isSubmitted, setIsSubmitted] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<LeadValues>({
        resolver: zodResolver(leadSchema),
        defaultValues: {
            name: initialData.name || '',
            email: initialData.email || '',
            contact: initialData.phone || '',
            scope: initialData.project_details || '',
            website: '' // Honeypot field
        }
    });

    const onFormSubmit = (data: LeadValues) => {
        // Honeypot check: if 'website' is filled, it's likely a bot
        if (data.website) {
            console.warn("[Security] Bot detected via honeypot.");
            return;
        }

        setIsSubmitted(true);
        triggerHaptic();
        
        // Map back to expected API format if necessary
        onSubmit({
            name: data.name,
            email: data.email,
            phone: data.contact,
            project_details: data.scope
        });
    };

    if (isSubmitted) {
        return (
            <Card className="w-full max-w-sm ml-auto mr-4 bg-green-50 border-green-200 animate-in fade-in zoom-in duration-300">
                <CardContent className="pt-6 text-center text-green-700">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-semibold">Dati inviati correttamente!</p>
                    <p className="text-sm">Stiamo elaborando la tua richiesta.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-sm ml-auto mr-4 shadow-lg border-primary/20 bg-white/95 backdrop-blur">
            <CardHeader className="pb-3 bg-slate-50 rounded-t-xl border-b">
                <div className="flex items-center gap-2 text-primary">
                    <User className="w-5 h-5" />
                    <CardTitle className="text-lg">Scheda Contatto</CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-1">
                    {description}
                </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
                <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-3">
                    {/* Honeypot field - Hidden from users */}
                    <div className="hidden" aria-hidden="true">
                        <input {...register("website")} tabIndex={-1} autoComplete="off" />
                    </div>

                    {/* 1. Nome */}
                    <div className="space-y-1">
                        <div className="relative">
                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                {...register("name")}
                                placeholder="Nome e Cognome"
                                className={`pl-9 text-sm ${errors.name ? 'border-red-500' : ''}`}
                            />
                        </div>
                        {errors.name && (
                            <p className="text-[10px] text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.name.message}
                            </p>
                        )}
                    </div>

                    {/* 2. Email */}
                    <div className="space-y-1">
                        <div className="relative">
                            <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                {...register("email")}
                                type="email"
                                placeholder="Indirizzo Email"
                                className={`pl-9 text-sm ${errors.email ? 'border-red-500' : ''}`}
                            />
                        </div>
                        {errors.email && (
                            <p className="text-[10px] text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.email.message}
                            </p>
                        )}
                    </div>

                    {/* 3. Contatto (Telefono) */}
                    <div className="space-y-1">
                        <div className="relative">
                            <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                {...register("contact")}
                                type="tel"
                                placeholder="Telefono"
                                className={`pl-9 text-sm ${errors.contact ? 'border-red-500' : ''}`}
                            />
                        </div>
                        {errors.contact && (
                            <p className="text-[10px] text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.contact.message}
                            </p>
                        )}
                    </div>

                    {/* 4. Descrizione/Scope */}
                    <div className="space-y-1">
                        <div className="relative">
                            <FileText className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Textarea
                                {...register("scope")}
                                placeholder="Descrivi brevemente la tua richiesta..."
                                className={`pl-9 text-sm min-h-[80px] resize-none ${errors.scope ? 'border-red-500' : ''}`}
                            />
                        </div>
                        {errors.scope && (
                            <p className="text-[10px] text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.scope.message}
                            </p>
                        )}
                    </div>

                    <Button type="submit" className="w-full mt-2 gap-2 font-semibold">
                        Invia Dati <Send className="w-4 h-4" />
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};
