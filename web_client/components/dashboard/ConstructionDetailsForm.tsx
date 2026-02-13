"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    updateProjectDetails,
} from "@/app/actions/project-details";
import { projectDetailsSchema, type ProjectDetailsFormData } from "@/lib/validation/project-details-schema";
import type { ProjectDetails, PropertyType } from "@/types/projects";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ConstructionDetailsFormProps {
    sessionId: string;
    initialData?: ProjectDetails;
}

export default function ConstructionDetailsForm({
    sessionId,
    initialData,
}: ConstructionDetailsFormProps) {
    const [isPending, startTransition] = useTransition();
    const [submitMessage, setSubmitMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<ProjectDetailsFormData>({
        resolver: zodResolver(projectDetailsSchema),
        defaultValues: initialData ? {
            id: initialData.id,
            footage_sqm: initialData.footage_sqm,
            property_type: initialData.property_type,
            address: {
                street: initialData.address.street,
                city: initialData.address.city,
                zip: initialData.address.zip,
            },
            budget_cap: initialData.budget_cap,
            technical_notes: initialData.technical_notes,
            renovation_constraints: initialData.renovation_constraints,
        } : {
            id: sessionId,
            footage_sqm: undefined as unknown as number,
            property_type: "apartment" as const,
            address: {
                street: "",
                city: "",
                zip: "",
            },
            budget_cap: undefined as unknown as number,
            technical_notes: undefined,
            renovation_constraints: [],
        },
    });

    const onSubmit = (data: ProjectDetailsFormData) => {
        startTransition(async () => {
            try {
                // Convert to FormData for server action
                const formData = new FormData();
                formData.append("footage_sqm", data.footage_sqm.toString());
                formData.append("property_type", data.property_type);
                formData.append("address_street", data.address.street);
                formData.append("address_city", data.address.city);
                formData.append("address_zip", data.address.zip);
                formData.append("budget_cap", data.budget_cap.toString());
                if (data.technical_notes) {
                    formData.append("technical_notes", data.technical_notes);
                }
                formData.append(
                    "renovation_constraints",
                    JSON.stringify(data.renovation_constraints)
                );

                const result = await updateProjectDetails(sessionId, formData);

                if (result.success) {
                    setSubmitMessage({ type: "success", text: result.message });
                    setTimeout(() => setSubmitMessage(null), 5000);
                } else {
                    setSubmitMessage({
                        type: "error",
                        text: result.message,
                    });
                }
            } catch (error) {
                setSubmitMessage({
                    type: "error",
                    text: "Si è verificato un errore imprevisto.",
                });
            }
        });
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-10 glass-premium border-luxury-gold/10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            {/* Design Element - Radial Glow */}
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-luxury-teal/5 rounded-full blur-[100px] pointer-events-none transition-all duration-1000 group-hover:bg-luxury-teal/10" />

            <div className="mb-12 relative z-10">
                <h2 className="text-3xl font-bold text-luxury-text mb-3 font-serif">
                    Specifiche del <span className="text-luxury-gold italic">Cantiere</span>
                </h2>
                <p className="text-luxury-text/60 font-medium leading-relaxed max-w-2xl">
                    Questi dettagli tecnici permettono al nostro sistema AI di calcolare preventivi accurati e suggerimenti di design ottimizzati per il tuo spazio reale.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-10 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Property Type */}
                    <div className="space-y-2.5">
                        <label
                            htmlFor="property_type"
                            className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                        >
                            Tipo di Immobile *
                        </label>
                        <select
                            {...register("property_type")}
                            id="property_type"
                            className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none appearance-none font-medium shadow-inner"
                        >
                            <option value="apartment">Appartamento</option>
                            <option value="villa">Villa</option>
                            <option value="commercial">Locale Commerciale</option>
                        </select>
                        {errors.property_type && (
                            <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                {errors.property_type.message}
                            </p>
                        )}
                    </div>

                    {/* Square Footage */}
                    <div className="space-y-2.5">
                        <label
                            htmlFor="footage_sqm"
                            className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                        >
                            Metratura (m²) *
                        </label>
                        <div className="relative">
                            <input
                                {...register("footage_sqm", { valueAsNumber: true })}
                                type="number"
                                id="footage_sqm"
                                step="0.01"
                                className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none font-medium shadow-inner"
                                placeholder="es. 120"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-luxury-text/30 font-bold text-xs">SQM</div>
                        </div>
                        {errors.footage_sqm && (
                            <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                {errors.footage_sqm.message}
                            </p>
                        )}
                    </div>
                </div>

                {/* Address Section */}
                <div className="space-y-6 pt-6 border-t border-luxury-gold/10">
                    <h3 className="text-xl font-bold text-luxury-text font-serif flex items-center gap-3">
                        <span className="w-8 h-[1px] bg-luxury-gold/30" />
                        Localizzazione Cantiere
                    </h3>

                    <div className="space-y-2.5">
                        <label
                            htmlFor="address_street"
                            className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                        >
                            Indirizzo e Civico *
                        </label>
                        <input
                            {...register("address.street")}
                            type="text"
                            id="address_street"
                            className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none font-medium shadow-inner"
                            placeholder="es. Via Alessandro Manzoni 15"
                        />
                        {errors.address?.street && (
                            <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                {errors.address.street.message}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2.5">
                            <label
                                htmlFor="address_city"
                                className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                            >
                                Città *
                            </label>
                            <input
                                {...register("address.city")}
                                type="text"
                                id="address_city"
                                className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none font-medium shadow-inner"
                                placeholder="es. Milano"
                            />
                            {errors.address?.city && (
                                <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                    {errors.address.city.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2.5">
                            <label
                                htmlFor="address_zip"
                                className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                            >
                                CAP *
                            </label>
                            <input
                                {...register("address.zip")}
                                type="text"
                                id="address_zip"
                                className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none font-medium shadow-inner"
                                placeholder="es. 20121"
                            />
                            {errors.address?.zip && (
                                <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                                    {errors.address.zip.message}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Budget Cap */}
                <div className="space-y-2.5 pt-6 border-t border-luxury-gold/10">
                    <label
                        htmlFor="budget_cap"
                        className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                    >
                        Budget di Riferimento (€) *
                    </label>
                    <div className="relative">
                        <input
                            {...register("budget_cap", { valueAsNumber: true })}
                            type="number"
                            id="budget_cap"
                            step="100"
                            className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none font-bold text-xl shadow-inner text-luxury-teal"
                            placeholder="es. 75.000"
                        />
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-focus-within:opacity-10 transition-opacity">€</div>
                    </div>
                    {errors.budget_cap && (
                        <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                            {errors.budget_cap.message}
                        </p>
                    )}
                </div>

                {/* Technical Notes */}
                <div className="space-y-2.5">
                    <label
                        htmlFor="technical_notes"
                        className="block text-xs font-bold text-luxury-gold uppercase tracking-[0.2em]"
                    >
                        Vincoli e Note Architettoniche
                    </label>
                    <textarea
                        {...register("technical_notes")}
                        id="technical_notes"
                        rows={5}
                        className="w-full px-5 py-4 border border-luxury-gold/20 rounded-xl bg-luxury-bg/50 text-luxury-text focus:ring-2 focus:ring-luxury-teal/50 focus:border-luxury-teal transition-all outline-none font-medium shadow-inner resize-none"
                        placeholder="es. Parete portante abbattibile con trave HEB140, riscaldamento a pavimento esistente, vincoli paesaggistici..."
                    />
                    {errors.technical_notes && (
                        <p className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                            {errors.technical_notes.message}
                        </p>
                    )}
                </div>

                {/* Submit Message */}
                {submitMessage && (
                    <div
                        className={`p-6 rounded-2xl animate-in zoom-in-95 duration-300 border backdrop-blur-xl ${submitMessage.type === "success"
                            ? "bg-luxury-teal/10 border-luxury-teal/30 shadow-[0_0_20px_rgba(42,157,143,0.1)]"
                            : "bg-red-500/10 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                            }`}
                    >
                        <div className="flex items-center gap-4">
                            {submitMessage.type === "success" ? (
                                <CheckCircle2 className="w-6 h-6 text-luxury-teal" />
                            ) : (
                                <XCircle className="w-6 h-6 text-red-500" />
                            )}
                            <p
                                className={`text-sm font-bold uppercase tracking-widest ${submitMessage.type === "success"
                                    ? "text-luxury-teal"
                                    : "text-red-400"
                                    }`}
                            >
                                {submitMessage.text}
                            </p>
                        </div>
                    </div>
                )}

                {/* Submit Button */}
                <div className="flex flex-col sm:flex-row justify-end gap-5 pt-6 border-t border-luxury-gold/10">
                    <button
                        type="button"
                        onClick={() => reset()}
                        disabled={isPending}
                        className="px-8 py-4 text-xs font-bold text-luxury-text/40 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 hover:text-luxury-text transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
                    >
                        Ripristina Campi
                    </button>
                    <button
                        type="submit"
                        disabled={isPending}
                        className="px-10 py-4 text-xs font-bold text-white bg-luxury-teal rounded-xl hover:bg-luxury-teal/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-luxury-teal/20 uppercase tracking-[0.2em] transform active:scale-95"
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="animate-spin h-5 w-5" />
                                Archiviazione...
                            </>
                        ) : (
                            "Salva Configurazione"
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
