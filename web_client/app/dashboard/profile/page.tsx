'use client';

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { User, Lock, Bell, Camera, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import NextImage from "next/image";
import { updateUserProfile, uploadUserAvatar } from "@/app/actions/profile";
import { compressImage } from "@/lib/media-utils";
import { PasskeyButton } from "@/components/auth/PasskeyButton";
import { SydLoader } from "@/components/ui/SydLoader";
import { usePasskey } from "@/hooks/usePasskey";
import { cn } from "@/lib/utils";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const { preferences, updatePreferences, error: preferencesError } = useUserPreferences();
    const { checkHasPasskeys, hasPasskeys } = usePasskey();
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const avatarPreviewRef = useRef<string | null>(null);

    useEffect(() => {
        if (user) {
            checkHasPasskeys();
            // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed the editable field from the loaded/refreshed user, not on every keystroke
            setDisplayName(user.displayName ?? '');
        }
    }, [user, checkHasPasskeys]);

    // Clear any pending success-message timers on unmount.
    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach(clearTimeout);
        };
    }, []);

    // Revoke the last blob: preview URL on unmount to avoid leaking it.
    useEffect(() => {
        avatarPreviewRef.current = avatarPreview;
    }, [avatarPreview]);
    useEffect(() => {
        return () => {
            if (avatarPreviewRef.current) {
                URL.revokeObjectURL(avatarPreviewRef.current);
            }
        };
    }, []);

    // Surface a notifications-save failure through the same banner as everything else.
    useEffect(() => {
        if (preferencesError) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: surface a hook-internal failure in the page's shared banner
            setErrorMessage(preferencesError);
        }
    }, [preferencesError]);

    const initials = user?.displayName
        ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || 'U';

    const showSuccess = useCallback((message: string) => {
        setErrorMessage(null);
        setSuccessMessage(message);
        const timer = setTimeout(() => setSuccessMessage(null), 3000);
        timersRef.current.push(timer);
    }, []);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSuccessMessage(null);
        setErrorMessage(null);
        setIsUploadingAvatar(true);

        try {
            const compressed = await compressImage(file);

            if (compressed.size > MAX_AVATAR_BYTES) {
                setErrorMessage("Il file non può superare i 5MB, anche dopo la compressione.");
                return;
            }

            if (avatarPreviewRef.current) {
                URL.revokeObjectURL(avatarPreviewRef.current);
            }
            setAvatarPreview(URL.createObjectURL(compressed));

            const formData = new FormData();
            formData.append('avatar', compressed, 'avatar.webp');
            const result = await uploadUserAvatar(formData);

            if (result.success) {
                await refreshUser();
                // The client SDK user now carries the persisted photoURL, so
                // drop the local blob preview and let it take over.
                if (avatarPreviewRef.current) {
                    URL.revokeObjectURL(avatarPreviewRef.current);
                }
                setAvatarPreview(null);
                showSuccess(result.message || "Foto profilo aggiornata!");
            } else {
                setErrorMessage(result.message || "Errore durante il caricamento della foto.");
            }
        } catch (error) {
            console.error('[ProfilePage] Avatar upload failed:', error);
            setErrorMessage("Errore di connessione. Riprova.");
        } finally {
            setIsUploadingAvatar(false);
            // Reset so re-selecting the same file re-fires onChange.
            e.target.value = '';
        }
    };

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        setSuccessMessage(null);
        setErrorMessage(null);
        setNameError(null);

        try {
            const formData = new FormData();
            formData.append('displayName', displayName);
            const result = await updateUserProfile(formData);

            if (result.success) {
                await refreshUser();
                showSuccess(result.message || "Profilo salvato correttamente.");
            } else {
                setNameError(result.errors?.displayName?.[0] ?? null);
                setErrorMessage(result.message || "Errore durante il salvataggio.");
            }
        } catch (error) {
            console.error('[ProfilePage] Save profile failed:', error);
            setErrorMessage("Errore durante il salvataggio.");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const toggleQuoteNotifications = async () => {
        if (!preferences) return;

        await updatePreferences({
            notifications: {
                ...preferences.notifications,
                quoteReady: !preferences.notifications?.quoteReady
            }
        });
        // Failure (if any) surfaces via the `preferencesError` effect above —
        // useUserPreferences.updatePreferences() never rejects, it records
        // the failure on its own `error` state instead.
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl md:text-4xl font-bold text-luxury-text font-serif">Il Tuo <span className="text-luxury-gold italic">Profilo</span></h1>
                <p className="text-luxury-text/50">Gestisci le tue informazioni personali e le preferenze dell&apos;account.</p>
            </div>

            {/* Feedback banner */}
            {(errorMessage || successMessage) && (
                <div
                    role={errorMessage ? "alert" : "status"}
                    className={cn(
                        "flex items-center gap-3 p-4 rounded-2xl border text-sm font-medium",
                        errorMessage
                            ? "bg-red-500/10 border-red-500/20 text-red-400"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    )}
                >
                    {errorMessage ? (
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                    ) : (
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                    )}
                    <p>{errorMessage || successMessage}</p>
                </div>
            )}

            {/* Profile Section */}
            <div className="flex flex-col md:flex-row items-center gap-8 p-8 glass-premium border border-luxury-gold/10 rounded-3xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-luxury-gold/5 rounded-full blur-3xl pointer-events-none" />

                <div className="relative">
                    {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- blob: preview URLs cannot be validated by next/image's remotePatterns check
                        <img
                            src={avatarPreview}
                            alt="Avatar"
                            width={100}
                            height={100}
                            className="w-24 h-24 object-cover rounded-full border-4 border-luxury-gold/20 shadow-xl"
                        />
                    ) : user?.photoURL ? (
                        <NextImage
                            src={user.photoURL}
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
                            <label htmlFor="displayName" className="text-[10px] uppercase font-bold text-luxury-text/30">Nome Visualizzato</label>
                            <input
                                id="displayName"
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Il tuo nome"
                                className="w-full bg-transparent border-b border-white/10 focus:border-luxury-gold outline-none text-luxury-text font-medium py-1 transition-colors"
                            />
                            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-luxury-text/30">Email</label>
                            <p className="text-luxury-text font-medium">{user?.email}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 glass-premium border border-white/5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-luxury-gold">
                            <Lock className="w-5 h-5" />
                            <h3 className="font-bold uppercase tracking-widest text-xs">Sicurezza Biometrica</h3>
                        </div>
                        {hasPasskeys && (
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-wide">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                ATTIVA
                            </span>
                        )}
                    </div>
                    <div className="space-y-4">
                        <p className="text-sm text-luxury-text/60 leading-relaxed">
                            {hasPasskeys
                                ? "Hai configurato l'accesso biometrico per questo account. Puoi usare FaceID o TouchID per accedere rapidamente."
                                : "Accedi istantaneamente senza password usando FaceID o TouchID sul tuo dispositivo."
                            }
                        </p>

                        <div className="pt-2">
                            <PasskeyButton mode="register" />
                        </div>
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
                        <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-luxury-gold focus:ring-offset-2 focus:ring-offset-luxury-bg"
                            style={{ backgroundColor: preferences?.notifications?.quoteReady ? '#D4AF37' : '#334155' }}
                            onClick={(e) => {
                                e.preventDefault();
                                toggleQuoteNotifications();
                            }}
                            role="switch"
                            aria-checked={preferences?.notifications?.quoteReady}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    preferences?.notifications?.quoteReady ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </div>
                    </label>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="px-8 py-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl hover:bg-luxury-gold/90 transition-all shadow-lg shadow-luxury-gold/20 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSavingProfile ? (
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
