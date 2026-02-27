import { z } from "zod";

/**
 * XSS Mitigation: Basic pattern to block HTML tags 
 */
const xssPattern = /<[^>]*>/;

/**
 * Authentication Schema (Login / Signup)
 * Unified validation rules following 'securing-applications' best practices.
 */
export const authSchema = z.object({
  email: z.string()
    .email({ message: "Inserisci un indirizzo email valido." })
    .max(320, { message: "L'email è troppo lunga." })
    .refine(val => !xssPattern.test(val), { message: "Input non valido." }),
    
  password: z.string()
    .min(8, { message: "La password deve essere di almeno 8 caratteri." })
    .max(100, { message: "La password è troppo lunga." })
    .regex(/[A-Z]/, { message: "La password deve contenere almeno una lettera maiuscola." })
    .regex(/[0-9]/, { message: "La password deve contenere almeno un numero." })
    .regex(/[^A-Za-z0-9]/, { message: "La password deve contenere almeno un carattere speciale." })
    .refine(val => !xssPattern.test(val), { message: "Input non valido." })
    .optional(),
});

export type AuthValues = z.infer<typeof authSchema>;

/**
 * Magic Link Schema
 * Only requires email validation.
 */
export const magicLinkSchema = authSchema.pick({ email: true });
export type MagicLinkValues = z.infer<typeof magicLinkSchema>;

/**
 * Reset Password Schema
 * Only requires email validation.
 */
export const resetPasswordSchema = authSchema.pick({ email: true });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
