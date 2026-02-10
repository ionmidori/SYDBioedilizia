import React, { useState } from 'react';
import { Send, User, Mail, Phone, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface LeadFormProps {
    onSubmit: (data: any) => void;
    description?: string; // La descrizione breve richiesta
    initialData?: any;
}

export const LeadCaptureForm: React.FC<LeadFormProps> = ({
    onSubmit,
    description = "Per completare la tua richiesta e inviarti il materiale, abbiamo bisogno di un tuo riferimento.",
    initialData = {}
}) => {
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        name: initialData.name || '',
        contact: initialData.phone || '', // Telefono o Cognome
        email: initialData.email || '',
        scope: initialData.project_details || ''    // Descrizione/Scope
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitted(true);
        onSubmit(formData);
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
                <form onSubmit={handleSubmit} className="space-y-3">
                    {/* 1. Nome */}
                    <div className="space-y-1">
                        <div className="relative">
                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Nome e Cognome"
                                className="pl-9 text-sm"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* 2. Email */}
                    <div className="space-y-1">
                        <div className="relative">
                            <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                type="email"
                                placeholder="Indirizzo Email"
                                className="pl-9 text-sm"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* 3. Contatto (Telefono) */}
                    <div className="space-y-1">
                        <div className="relative">
                            <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                type="tel"
                                placeholder="Telefono"
                                className="pl-9 text-sm"
                                required
                                value={formData.contact}
                                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* 4. Descrizione/Scope */}
                    <div className="space-y-1">
                        <div className="relative">
                            <FileText className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Textarea
                                placeholder="Descrivi brevemente la tua richiesta..."
                                className="pl-9 text-sm min-h-[80px] resize-none"
                                required
                                value={formData.scope}
                                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full mt-2 gap-2 font-semibold">
                        Invia Dati <Send className="w-4 h-4" />
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};
