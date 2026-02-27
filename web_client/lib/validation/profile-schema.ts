import { z } from "zod";

/**
 * Profile Update Schema
 * Validates user profile updates with strict type checking
 */
export const profileUpdateSchema = z.object({
    displayName: z
        .string()
        .min(2, "Il nome deve contenere almeno 2 caratteri")
        .max(50, "Il nome non può superare i 50 caratteri")
        .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, "Il nome può contenere solo lettere, spazi, apostrofi e trattini")
        .optional(),

    photoURL: z
        .string()
        .url("URL foto non valido")
        .optional(),
});

/**
 * User Preferences Schema
 * Validates notification and UI preferences
 */
export const userPreferencesSchema = z.object({
    notifications: z.object({
        email: z.boolean().default(true),
        quoteReady: z.boolean().default(true),
    }).default({
        email: true,
        quoteReady: true,
    }),

    ui: z.object({
        theme: z.enum(["light", "dark"]).optional(),
        sidebarCollapsed: z.boolean().default(false),
    }).optional(),
});

// Type exports for TypeScript
export type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
