"use server";

import { cookies } from "next/headers";

/**
 * Sets the authentication cookie for server-side access.
 * This bridges the gap between client-side Firebase Auth and Server Actions.
 */
export async function setAuthCookie(token: string): Promise<void> {
    const cookieStore = await cookies();

    // Set the cookie with appropriate security settings
    cookieStore.set("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        // Firebase ID tokens expire in 1 hour usually, but we can set a reasonable max age here
        // or rely on the client to refresh and update it.
        maxAge: 60 * 60 * 24 * 5, // 5 days
    });
}

/**
 * Removes the authentication cookie.
 */
export async function removeAuthCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete("auth-token");
}
