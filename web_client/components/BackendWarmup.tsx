"use client";

import { useEffect } from "react";
import { warmBackend } from "@/lib/backend-warmup";

/**
 * Invisible component that pre-warms the Cloud Run backend on page load.
 * The chat widget warms it again whenever it opens (see `lib/backend-warmup.ts`
 * for the throttling and why the request is never aborted on unmount).
 */
export function BackendWarmup() {
    useEffect(() => {
        warmBackend();
    }, []);

    return null;
}
