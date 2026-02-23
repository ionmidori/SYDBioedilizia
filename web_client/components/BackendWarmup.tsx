"use client";

import { useEffect } from "react";

const WARMUP_KEY = "syd_backend_warmed";
const WARMUP_TIMEOUT_MS = 5000;
const API_ROOT = process.env.NEXT_PUBLIC_API_URL || "/api/py";

/**
 * Invisible component that pings the backend /health endpoint once per
 * browser session to pre-warm the Cloud Run instance.
 *
 * Security notes:
 * - Uses plain fetch (no auth/App Check) since /health is a public endpoint
 * - Fires only once per sessionStorage lifecycle (tab open → close)
 * - AbortController prevents hanging requests on slow cold starts
 * - Fire-and-forget: errors are silently caught to avoid polluting console
 */
export function BackendWarmup() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (sessionStorage.getItem(WARMUP_KEY)) return;

        sessionStorage.setItem(WARMUP_KEY, "1");

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

        fetch(`${API_ROOT}/health`, {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
        })
            .catch(() => {
                // Silently ignore — warmup is best-effort
            })
            .finally(() => clearTimeout(timer));

        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, []);

    return null;
}
