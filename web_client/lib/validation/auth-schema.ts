import { z } from "zod";

/**
 * XSS Mitigation: Basic pattern to block HTML tags
 */
const xssPattern = /<[^>]*>/;

/**
 * Password policy. MUST mirror the Firebase Auth project policy
 * (Identity Platform `passwordPolicyConfig`: min 10, max 100, lowercase,
 * uppercase, numeric and non-alphanumeric required). Firebase enforces it
 * server-side; this copy gives instant, Italian feedback and keeps the form
 * from sending requests that would be rejected.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 100;

export interface PasswordChecks {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  symbol: boolean;
}

/** Per-rule result, used by the live checklist under the password field. */
export function getPasswordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

const emailField = z.string()
  .email({ message: "Inserisci un indirizzo email valido." })
  .max(320, { message: "L'email è troppo lunga." })
  .refine(val => !xssPattern.test(val), { message: "Input non valido." });

/** Strong password: used only when CHOOSING a password (signup, change, reset). */
export const newPasswordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, { message: `La password deve essere di almeno ${PASSWORD_MIN_LENGTH} caratteri.` })
  .max(PASSWORD_MAX_LENGTH, { message: "La password è troppo lunga." })
  .regex(/[a-z]/, { message: "La password deve contenere almeno una lettera minuscola." })
  .regex(/[A-Z]/, { message: "La password deve contenere almeno una lettera maiuscola." })
  .regex(/[0-9]/, { message: "La password deve contenere almeno un numero." })
  .regex(/[^A-Za-z0-9]/, { message: "La password deve contenere almeno un simbolo." })
  .refine(val => !xssPattern.test(val), { message: "Input non valido." });

/**
 * Sign-up: strong password typed twice.
 */
export const signupSchema = z.object({
  email: emailField,
  password: newPasswordSchema,
  confirmPassword: z.string().min(1, { message: "Conferma la password." }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Le password non coincidono.",
  path: ["confirmPassword"],
});
export type SignupValues = z.infer<typeof signupSchema>;

/**
 * Sign-in: NO strength rules. Accounts created under an older, weaker policy
 * must still be able to sign in; Firebase decides whether the credentials are valid.
 */
export const signinSchema = z.object({
  email: emailField,
  password: z.string().min(1, { message: "Inserisci la password." }),
});
export type SigninValues = z.infer<typeof signinSchema>;

/**
 * Reset Password Schema
 * Only requires email validation.
 */
export const resetPasswordSchema = z.object({ email: emailField });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * Reset Password Confirm Schema (used in /auth/action when setting a new password via email link).
 */
export const resetPasswordConfirmSchema = z.object({
  password: newPasswordSchema,
  confirmPassword: z.string().min(1, { message: "Conferma la nuova password." }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Le password non coincidono.",
  path: ["confirmPassword"],
});
export type ResetPasswordConfirmValues = z.infer<typeof resetPasswordConfirmSchema>;

/**
 * Change Password Schema (Profile: authenticated email/password user).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Inserisci la password attuale." }),
  newPassword: newPasswordSchema,
  confirmPassword: z.string().min(1, { message: "Conferma la nuova password." }),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Le password non coincidono.",
  path: ["confirmPassword"],
}).refine(data => data.newPassword !== data.currentPassword, {
  message: "La nuova password deve essere diversa da quella attuale.",
  path: ["newPassword"],
});
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * Set Password Schema (Profile: user authenticated with Google/Passkey adding email+password login).
 */
export const setPasswordSchema = z.object({
  newPassword: newPasswordSchema,
  confirmPassword: z.string().min(1, { message: "Conferma la nuova password." }),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Le password non coincidono.",
  path: ["confirmPassword"],
});
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
