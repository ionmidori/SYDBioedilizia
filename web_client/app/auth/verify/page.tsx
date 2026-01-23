"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";

/**
 * Magic Link Verification Content
 * Separated for Suspense boundary optimization
 */
function VerifyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { completeMagicLink } = useAuth();

    const [status, setStatus] = useState<"loading" | "success" | "error" | "confirm_email">("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [emailInput, setEmailInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Extract the full URL (contains oobCode)
    const emailLink = typeof window !== "undefined" ? window.location.href : "";

    useEffect(() => {
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

        if (emailLink) {
            verifyLink();
        }
    }, [emailLink]);

    const attemptVerification = async (email: string) => {
        try {
            setStatus("loading");
            await completeMagicLink(emailLink, email);

            // Log analytics
            await fetch("/api/magic-link/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });

            setStatus("success");

            // Redirect after 2 seconds
            setTimeout(() => {
                router.push("/");
            }, 2000);

        } catch (error: any) {
            console.error("[VerifyPage] Verification failed:", error);
            setStatus("error");
            setErrorMessage(
                error.message === "Invalid email link"
                    ? "Il link non è valido o è scaduto."
                    : "Errore nella verifica. Riprova."
            );
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!emailInput.trim()) return;

        setIsSubmitting(true);
        await attemptVerification(emailInput.toLowerCase());
        setIsSubmitting(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full"
            >
                {/* Loading State */}
                {status === "loading" && (
                    <div className="text-center">
                        <Loader2 className="w-16 h-16 mx-auto text-blue-500 animate-spin mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Verifica in corso...</h2>
                        <p className="text-gray-400">Stiamo verificando il tuo accesso</p>
                    </div>
                )}

                {/* Success State */}
                {status === "success" && (
                    <div className="text-center">
                        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Accesso effettuato!</h2>
                        <p className="text-gray-400">Reindirizzamento in corso...</p>
                    </div>
                )}

                {/* Error State */}
                {status === "error" && (
                    <div className="text-center">
                        <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Errore</h2>
                        <p className="text-gray-400 mb-6">{errorMessage}</p>
                        <button
                            onClick={() => router.push("/")}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            Torna alla Home
                        </button>
                    </div>
                )}

                {/* Email Confirmation State (Cross-Device) */}
                {status === "confirm_email" && (
                    <div className="text-center">
                        <Mail className="w-16 h-16 mx-auto text-blue-500 mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Conferma la tua email</h2>
                        <p className="text-gray-400 mb-6">
                            Per motivi di sicurezza, conferma l'indirizzo email che hai utilizzato
                        </p>

                        <form onSubmit={handleEmailSubmit} className="space-y-4">
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="tua@email.com"
                                required
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center"
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
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        }>
            <VerifyContent />
        </Suspense>
    );
}
