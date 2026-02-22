"use server";

import { cookies } from "next/headers";

/**
 * Sets the authentication cookie for server-side access.
 * This bridges the gap between client-side Firebase Auth and Server Actions.
 */
export async function setAuthCookie(token: string): Promise<void> {
    const cookieStore = await cookies();

    // Set the cookie with appropriate security settings.
    // Firebase ID tokens expire after 1 hour; the cookie lifetime mirrors this.
    // The client-side TokenManager refreshes the token 5 min before expiry and
    // calls setAuthCookie again, so the cookie stays fresh during active sessions.
    cookieStore.set("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour — matches Firebase ID token lifetime
    });
}

/**
 * Removes the authentication cookie.
 */
export async function removeAuthCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete("auth-token");
}
