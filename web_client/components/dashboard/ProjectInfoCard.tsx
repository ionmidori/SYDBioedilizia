import { Project } from "@/types/projects";
import { Button } from "@/components/ui/button";
import {
    MapPin,
    Ruler,
    Building2,
    Wallet,
    FileText,
    Edit,
    AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ProjectInfoCardProps {
    project: Project;
    className?: string;
}

export default function ProjectInfoCard({ project, className }: ProjectInfoCardProps) {
    const details = project.construction_details;
    const hasDetails = !!details;

    // Helper to format currency
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        }).format(val);
    };

    // Helper for Property Type label
    const getPropertyLabel = (type: string) => {
        const map: Record<string, string> = {
            apartment: 'Appartamento',
            villa: 'Villa',
            commercial: 'Commerciale'
        };
        return map[type] || type;
    };

    return (
        <div className={cn("flex flex-col gap-4 h-full", className)}>
            {/* Header / Title Card */}
            <div className="p-4 rounded-3xl glass-premium border-luxury-gold/10 relative overflow-hidden group">
                <div className="absolute inset-0 bg-luxury-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h3 className="text-sm font-bold text-luxury-gold uppercase tracking-widest">
                            Scheda Cantiere
                        </h3>
                        {hasDetails ? (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] text-green-400 font-medium uppercase">Dati Sincronizzati</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                <span className="text-[10px] text-red-500 font-medium uppercase">Configurazione Mancante</span>
                            </div>
                        )}
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        asChild
                        className="h-8 w-8 rounded-full hover:bg-luxury-gold/20 hover:text-luxury-gold"
                    >
                        <Link href={`/dashboard/${project.session_id}/settings`}>
                            <Edit className="w-4 h-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Content Card */}
            <div className="flex-1 p-5 rounded-[2rem] glass-premium border-luxury-gold/5 flex flex-col gap-6 relative overflow-hidden">
                {!hasDetails ? (
                    // Empty State
                    <div className="flex flex-col items-center justify-center flex-1 text-center py-8">
                        <div className="p-4 bg-luxury-gold/5 rounded-full mb-3">
                            <AlertTriangle className="w-6 h-6 text-luxury-gold/50" />
                        </div>
                        <p className="text-xs text-luxury-text/60 font-medium mb-4 max-w-[200px]">
                            Aggiungi i dettagli del cantiere per migliorare la precisione dell&apos;AI.
                        </p>
                        <Button
                            asChild
                            variant="outline"
                            className="text-xs border-luxury-gold/30 text-luxury-gold hover:bg-luxury-gold hover:text-luxury-bg"
                        >
                            <Link href={`/dashboard/${project.session_id}/settings`}>
                                Configura Ora
                            </Link>
                        </Button>
                    </div>
                ) : (
                    // Details Grid
                    <>
                        {/* Primary Metrics */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white/5 rounded-2xl border border-white/5 hover:border-luxury-gold/20 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <Ruler className="w-3 h-3 text-luxury-teal" />
                                    <span className="text-[10px] text-luxury-text/40 font-bold uppercase">Superficie</span>
                                </div>
                                <p className="text-lg font-bold text-luxury-text font-serif">
                                    {details.footage_sqm} <span className="text-xs font-sans text-luxury-text/40">mq</span>
                                </p>
                            </div>

                            <div className="p-3 bg-white/5 rounded-2xl border border-white/5 hover:border-luxury-gold/20 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <Building2 className="w-3 h-3 text-luxury-teal" />
                                    <span className="text-[10px] text-luxury-text/40 font-bold uppercase">Tipologia</span>
                                </div>
                                <p className="text-sm font-bold text-luxury-text truncate">
                                    {getPropertyLabel(details.property_type)}
                                </p>
                            </div>
                        </div>

                        {/* Budget */}
                        <div className="p-4 bg-gradient-to-br from-luxury-gold/10 to-transparent rounded-2xl border border-luxury-gold/20 shadow-inner">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Wallet className="w-3 h-3 text-luxury-gold" />
                                    <span className="text-[10px] text-luxury-gold/60 font-bold uppercase">Budget Stimato</span>
                                </div>
                            </div>
                            <p className="text-2xl font-bold text-luxury-gold font-serif">
                                {formatCurrency(details.budget_cap)}
                            </p>
                        </div>

                        {/* Location */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-luxury-text/40">
                                <MapPin className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Localizzazione</span>
                            </div>
                            <div className="pl-5 border-l border-luxury-text/10">
                                <p className="text-sm font-medium text-luxury-text">
                                    {details.address.street}
                                </p>
                                <p className="text-xs text-luxury-text/60">
                                    {details.address.zip} {details.address.city}
                                </p>
                            </div>
                        </div>

                        {/* Technical Notes Preview */}
                        {details.technical_notes && (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <div className="flex items-center gap-2 text-luxury-text/40">
                                    <FileText className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase">Note Tecniche</span>
                                </div>
                                <p className="text-xs text-luxury-text/60 italic line-clamp-3 leading-relaxed">
                                    &quot;{details.technical_notes}&quot;
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
