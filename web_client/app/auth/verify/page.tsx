"use client";

import { useEffect, useRef, useState, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { magicLinkSchema, type MagicLinkValues } from "@/lib/validation/auth-schema";
import { triggerHaptic } from "@/utils/haptics";
import { magicLinkReturn } from "@/lib/auth/magic-link-return";
import { reopenChatOnNextPage } from "@/lib/chat/chat-window-state";

/**
 * Magic Link Verification Content
 * Separated for Suspense boundary optimization
 */
function VerifyContent() {
    const router = useRouter();
    const { completeMagicLink } = useAuth();

    const [status, setStatus] = useState<"loading" | "success" | "error" | "confirm_email">("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // React Hook Form for email confirmation
    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<MagicLinkValues>({
        resolver: zodResolver(magicLinkSchema),
        defaultValues: {
            email: ""
        }
    });

    // Extract the full URL (contains oobCode)
    const emailLink = typeof window !== "undefined" ? window.location.href : "";

    const attemptVerification = useCallback(async (email: string) => {
        try {
            setStatus("loading");
            await completeMagicLink(emailLink, email);

            setStatus("success");
            triggerHaptic();

            // Back to the page the link was asked from, chat as it was, after
            // 2 seconds. replace: this page does not stay in the history.
            const { next, reopenChat } = magicLinkReturn(window.location.search);
            if (reopenChat) reopenChatOnNextPage();
            setTimeout(() => {
                router.replace(next);
            }, 2000);

        } catch (error: unknown) {
            console.error("[VerifyPage] Verification failed:", error);
            setStatus("error");

            let msg = "Errore nella verifica. Riprova.";
            if (error instanceof Error && error.message === "Invalid email link") {
                msg = "Il link non è valido o è scaduto.";
            }
            setErrorMessage(msg);
        }
    }, [emailLink, completeMagicLink, router]);

    // A link works once: the login renders this page again with a new
    // completeMagicLink, and a second attempt would fail and show the error.
    const verificationStarted = useRef(false);

    useEffect(() => {
        if (!emailLink || verificationStarted.current) return;
        verificationStarted.current = true;

        const verifyLink = async () => {
            // Check if email is stored (same device)
            const storedEmail = window.localStorage.getItem("emailForSignIn");

            if (storedEmail) {
                // Same device - auto-verify
                await attemptVerification(storedEmail);
            } else {
                // Cross-device - request confirmation
                setStatus("confirm_email");
            }
        };

        verifyLink();
    }, [emailLink, attemptVerification]);

    const onConfirmEmail = async (data: MagicLinkValues) => {
        setIsSubmitting(true);
        triggerHaptic();
        await attemptVerification(data.email.toLowerCase());
        setIsSubmitting(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface-muted to-canvas flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-surface backdrop-blur-xl border border-line rounded-2xl p-8 max-w-md w-full"
            >
                {/* Loading State */}
                {status === "loading" && (
                    <div className="text-center">
                        <Loader2 className="w-16 h-16 mx-auto text-info-ink animate-spin mb-4" />
                        <h2 className="text-2xl font-bold text-ink mb-2">Verifica in corso...</h2>
                        <p className="text-ink-muted">Stiamo verificando il tuo accesso</p>
                    </div>
                )}

                {/* Success State */}
                {status === "success" && (
                    <div className="text-center">
                        <CheckCircle className="w-16 h-16 mx-auto text-success-ink mb-4" />
                        <h2 className="text-2xl font-bold text-ink mb-2">Accesso effettuato!</h2>
                        <p className="text-ink-muted">Reindirizzamento in corso...</p>
                    </div>
                )}

                {/* Error State */}
                {status === "error" && (
                    <div className="text-center">
                        <XCircle className="w-16 h-16 mx-auto text-danger-ink mb-4" />
                        <h2 className="text-2xl font-bold text-ink mb-2">Errore</h2>
                        <p className="text-ink-muted mb-6">{errorMessage}</p>
                        <button
                            onClick={() => router.push("/")}
                            className="px-6 py-3 bg-info hover:bg-info/90 text-on-info rounded-lg transition-colors"
                        >
                            Torna alla Home
                        </button>
                    </div>
                )}

                {/* Email Confirmation State (Cross-Device) */}
                {status === "confirm_email" && (
                    <div className="text-center">
                        <Mail className="w-16 h-16 mx-auto text-info-ink mb-4" />
                        <h2 className="text-2xl font-bold text-ink mb-2">Conferma la tua email</h2>
                        <p className="text-ink-muted mb-6">
                            Per motivi di sicurezza, conferma l&apos;indirizzo email che hai utilizzato
                        </p>

                        <form onSubmit={handleSubmit(onConfirmEmail)} className="space-y-4">
                            <div className="space-y-1">
                                <input
                                    {...register("email")}
                                    type="email"
                                    placeholder="tua@email.com"
                                    className={`w-full px-4 py-3 bg-surface-muted border rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-info transition-all ${
                                        errors.email ? 'border-danger ring-1 ring-danger/50' : 'border-line-strong'
                                    }`}
                                />
                                {errors.email && (
                                    <p className="text-xs text-danger-ink text-left mt-1">{errors.email.message}</p>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full px-6 py-3 bg-info hover:bg-info/90 disabled:bg-line-strong text-on-info rounded-lg transition-colors flex items-center justify-center"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Verifica...
                                    </>
                                ) : (
                                    "Conferma"
                                )}
                            </button>
                        </form>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

/**
 * Magic Link Verification Page
 * Wraps content in Suspense to fix prerendering errors with useSearchParams
 */
export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-canvas flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-info-ink animate-spin" />
            </div>
        }>
            <VerifyContent />
        </Suspense>
    );
}
