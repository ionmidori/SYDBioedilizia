'use client';

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { User, Mail, Lock, Bell, Camera, Save, AlertTriangle } from "lucide-react";
import NextImage from "next/image";
import { updateUserProfile, uploadUserAvatar } from "@/app/actions/profile";
import { PasskeyButton } from "@/components/auth/PasskeyButton";
import { SydLoader } from "@/components/ui/SydLoader";

export default function ProfilePage() {
    const { user } = useAuth();
    const { preferences, updatePreferences } = useUserPreferences();
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const initials = user?.displayName
        ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || 'U';

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Preview locally
        const previewUrl = URL.createObjectURL(file);
        setAvatarPreview(previewUrl);

        setIsUploadingAvatar(true);
        setErrorMessage(null);

        try {
            const formData = new FormData();
            formData.append('avatar', file);
            const result = await uploadUserAvatar(formData);
            
            if (result.success) {
                setSuccessMessage("Foto profilo aggiornata!");
                setTimeout(() => setSuccessMessage(null), 3000);
            } else {
                setErrorMessage(result.message || "Errore durante l'upload.");
            }
        } catch (error) {
            setErrorMessage("Errore di connessione.");
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async () => {
        setIsLoading(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            // Mock save for now as preferences are handled by hook
            await new Promise(resolve => setTimeout(resolve, 1000));
            setSuccessMessage("Profilo salvato correttamente.");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            setErrorMessage("Errore durante il salvataggio.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl md:text-4xl font-bold text-luxury-text font-serif">Il Tuo <span className="text-luxury-gold italic">Profilo</span></h1>
                <p className="text-luxury-text/50">Gestisci le tue informazioni personali e le preferenze dell'account.</p>
            </div>

            {/* Profile Section */}
            <div className="flex flex-col md:flex-row items-center gap-8 p-8 glass-premium border border-luxury-gold/10 rounded-3xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-luxury-gold/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative">
                    {avatarPreview || user?.photoURL ? (
                        <NextImage
                            src={avatarPreview || user?.photoURL || ''}
                            alt="Avatar"
                            width={100}
                            height={100}
                            className="rounded-full border-4 border-luxury-gold/20 shadow-xl"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full border-4 border-luxury-gold/30 bg-luxury-gold/10 flex items-center justify-center text-luxury-gold font-black text-2xl shadow-xl">
                            {initials}
                        </div>
                    )}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="absolute bottom-0 right-0 p-2 bg-luxury-gold text-luxury-bg rounded-full shadow-lg hover:bg-luxury-gold/90 transition-colors disabled:opacity-50"
                    >
                        {isUploadingAvatar ? (
                            <SydLoader size="sm" />
                        ) : (
                            <Camera className="w-4 h-4" />
                        )}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        onChange={handleAvatarChange}
                        className="hidden"
                    />
                </div>
                <div className="space-y-2">
                    <p className="text-luxury-text font-medium">Cambia la tua foto profilo</p>
                    <p className="text-luxury-text/50 text-sm">JPG, PNG, WEBP o HEIC. Max 5MB.</p>
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 glass-premium border border-white/5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 text-luxury-gold">
                        <User className="w-5 h-5" />
                        <h3 className="font-bold uppercase tracking-widest text-xs">Informazioni Personali</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-luxury-text/30">Nome Visualizzato</label>
                            <p className="text-luxury-text font-medium">{user?.displayName || 'Non impostato'}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-luxury-text/30">Email</label>
                            <p className="text-luxury-text font-medium">{user?.email}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 glass-premium border border-white/5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 text-luxury-gold">
                        <Lock className="w-5 h-5" />
                        <h3 className="font-bold uppercase tracking-widest text-xs">Sicurezza Biometrica</h3>
                    </div>
                    <div className="space-y-4">
                        <p className="text-sm text-luxury-text/60 leading-relaxed">
                            Accedi istantaneamente senza password usando FaceID o TouchID sul tuo dispositivo.
                        </p>
                        <PasskeyButton mode="register" />
                    </div>
                </div>
            </div>

            {/* Notifications */}
            <div className="p-8 glass-premium border border-white/5 rounded-3xl space-y-6">
                <div className="flex items-center gap-3 text-luxury-gold">
                    <Bell className="w-5 h-5" />
                    <h3 className="font-bold uppercase tracking-widest text-xs">Preferenze Notifiche</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                        <div className="space-y-0.5">
                            <p className="text-luxury-text font-medium group-hover:text-luxury-gold transition-colors">Aggiornamenti Preventivi</p>
                            <p className="text-sm text-luxury-text/50">Ricevi notifiche quando i preventivi sono pronti</p>
                        </div>
                    </label>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSaveProfile}
                    disabled={isLoading}
                    className="px-8 py-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl hover:bg-luxury-gold/90 transition-all shadow-lg shadow-luxury-gold/20 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <SydLoader size="sm" />
                    ) : (
                        <Save className="w-5 h-5" />
                    )}
                    Salva Modifiche
                </button>
            </div>
        </div>
    );
}
